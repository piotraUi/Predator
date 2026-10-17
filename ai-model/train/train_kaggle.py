"""Trening asystenta Predatora na Kaggle (QLoRA).

Jak użyć: patrz ai-model/README.md. Skrypt działa w notatniku Kaggle (GPU T4/P100, 16 GB) albo na własnym GPU.
Wejście:  train.jsonl i val.jsonl z `npx tsx ../ai-model/gen/build.ts` (linia = {"messages":[...], "meta":{...}}).
Wyjście:  adapter LoRA w OUT_DIR/adapter oraz (opcjonalnie) scalony model w OUT_DIR/merged.

Uczy się TYLKO wiadomości asystenta (rola "assistant"); system, prośby użytkownika i wyniki narzędzi są maskowane (label = -100).
"""
import json
import os
import random
import sys

# ---------------------------------------------------------------- ustawienia (zmienne środowiskowe nadpisują)
MODEL = os.environ.get("BASE_MODEL", "Qwen/Qwen3-4B-Instruct-2507")
DATA_DIR = os.environ.get("DATA_DIR", "/kaggle/input/predator-ai-data")
OUT_DIR = os.environ.get("OUT_DIR", "/kaggle/working/predator-ai")
MAX_LEN = int(os.environ.get("MAX_LEN", "6144"))        # dłuższe próbki są pomijane (sceny ~4-5k tokenów)
EPOCHS = float(os.environ.get("EPOCHS", "2"))
LR = float(os.environ.get("LR", "2e-4"))
LORA_R = int(os.environ.get("LORA_R", "32"))
BATCH = int(os.environ.get("BATCH", "1"))
GRAD_ACC = int(os.environ.get("GRAD_ACC", "16"))
# ogólne polskie rozmowy (opcjonalnie): pomaga w swobodnym czacie. 0 = wyłączone.
# QUANT=4bit (QLoRA, domyślnie) albo none (LoRA na wagach fp16; zalecane dla Qwen3.5, ok. 10-14 GB VRAM)
QUANT = os.environ.get("QUANT", "4bit")
GENERAL_N = int(os.environ.get("GENERAL_N", "2500"))
GENERAL_DATASET = os.environ.get("GENERAL_DATASET", "saillab/alpaca-polish-cleaned")
MAX_TRAIN = int(os.environ.get("MAX_TRAIN", "0"))        # 0 = wszystko; do szybkiego testu np. 200
SEED = 42
# wiele kart (Kaggle T4 x2): uruchom przez `torchrun --nproc_per_node 2 train_kaggle.py` - każda karta trzyma własną kopię modelu (DDP)
RANK = int(os.environ.get("RANK", "0"))
LOCAL_RANK = int(os.environ.get("LOCAL_RANK", "0"))
WORLD = int(os.environ.get("WORLD_SIZE", "1"))


# ---------------------------------------------------------------- dane
def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def general_samples(system_prompts, n):
    """Ogólne rozmowy po polsku z otwartego zbioru (tłumaczone instrukcje). Używają tego samego promptu systemowego co reszta."""
    if n <= 0:
        return []
    from datasets import load_dataset

    ds = load_dataset(GENERAL_DATASET, split="train")
    rnd = random.Random(SEED)
    idx = list(range(len(ds)))
    rnd.shuffle(idx)
    out = []
    for i in idx:
        r = ds[i]
        q = (r.get("instruction") or "").strip()
        inp = (r.get("input") or "").strip()
        a = (r.get("output") or "").strip()
        if inp and inp.lower() != "nan":
            q = f"{q}\n\n{inp}"
        # krótkie, sensowne pary; odrzucamy puste i bardzo długie
        if len(q) < 8 or len(a) < 8 or len(q) + len(a) > 3500:
            continue
        out.append({"messages": [{"role": "system", "content": rnd.choice(system_prompts)}, {"role": "user", "content": q}, {"role": "assistant", "content": a}], "meta": {"kind": "general"}})
        if len(out) >= n:
            break
    return out


# ---------------------------------------------------------------- tokenizacja z maską
END = os.environ.get("END_TOKEN", "<|im_end|>")


def render(tok, messages):
    # Qwen3.5 domyślnie "myśli" (<think>) - wyłączamy; starsze szablony ignorują ten parametr
    return tok.apply_chat_template(messages, tokenize=False, enable_thinking=False)


def encode(tok, messages, max_len):
    """Zwraca (input_ids, labels) albo None, gdy za długie. Etykiety tylko dla tekstu asystenta (z <|im_end|>).
    Fragmenty asystenta znajdujemy po treści w wyrenderowanym tekście, więc działa to z każdym szablonem (także z pustym <think>)."""
    full = render(tok, messages)
    spans = []
    cur = 0
    for m in messages:
        if m["role"] != "assistant":
            continue
        text = m["content"].strip()
        start = full.find(text, cur)
        if start < 0:
            raise ValueError("nie znaleziono odpowiedzi asystenta w szablonie: " + text[:60])
        end = start + len(text)
        if full.startswith(END, end):
            end += len(END)
        spans.append((start, end))
        cur = end
    enc = tok(full, add_special_tokens=False, return_offsets_mapping=True)
    ids = enc["input_ids"]
    if len(ids) > max_len:
        return None
    labels = [-100] * len(ids)
    si = 0
    for k, (a, b) in enumerate(enc["offset_mapping"]):
        while si < len(spans) and a >= spans[si][1]:
            si += 1
        if si < len(spans) and a >= spans[si][0] and b <= spans[si][1] and b > a:
            labels[k] = ids[k]
    return ids, labels


def selftest(tok, rows):
    """Sprawdza maskowanie bez GPU: wypisuje, ile tokenów jest uczonych, i pokazuje fragment."""
    for r in rows[:3]:
        res = encode(tok, r["messages"], 10**9)
        ids, labels = res
        learned = sum(1 for x in labels if x != -100)
        print(f"tokenów {len(ids)}, uczonych {learned} ({100*learned//max(1,len(ids))}%)")
        # pokaż pierwszy uczony fragment
        txt = tok.decode([t for t, l in zip(ids, labels) if l != -100][:60])
        print("  początek uczonego tekstu:", repr(txt[:160]))
        # żaden token roli system/user nie może być uczony
        dec_user = tok.decode([t for t, l in zip(ids, labels) if l != -100])
        assert "<|im_start|>user" not in dec_user and "<|im_start|>system" not in dec_user
        assert "<think>" not in dec_user or "<think>" in "".join(m["content"] for m in r["messages"]), "uczony tekst zawiera <think>"
    print("maskowanie OK")


# ---------------------------------------------------------------- trening
def main():
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(MODEL)
    train_rows = read_jsonl(os.path.join(DATA_DIR, "train.jsonl"))
    val_rows = read_jsonl(os.path.join(DATA_DIR, "val.jsonl"))
    if "--selftest" in sys.argv:
        selftest(tok, train_rows)
        return
    systems = list({r["messages"][0]["content"] for r in train_rows[:200]})
    train_rows += general_samples(systems, GENERAL_N)
    random.Random(SEED).shuffle(train_rows)
    if MAX_TRAIN:
        train_rows = train_rows[:MAX_TRAIN]

    import torch
    if WORLD > 1:
        torch.cuda.set_device(LOCAL_RANK)
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, BitsAndBytesConfig, Trainer, TrainingArguments

    def build(rows):
        out, skipped = [], 0
        for r in rows:
            e = encode(tok, r["messages"], MAX_LEN)
            if e is None:
                skipped += 1
                continue
            out.append({"input_ids": e[0], "labels": e[1]})
        print(f"próbek: {len(out)} (pominięto za długich: {skipped})")
        return out

    train_ds, val_ds = build(train_rows), build(val_rows[:150])

    class DS(torch.utils.data.Dataset):
        def __init__(self, rows): self.rows = rows
        def __len__(self): return len(self.rows)
        def __getitem__(self, i): return self.rows[i]

    def collate(batch):
        m = max(len(b["input_ids"]) for b in batch)
        pad = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
        ids = torch.tensor([b["input_ids"] + [pad] * (m - len(b["input_ids"])) for b in batch])
        lab = torch.tensor([b["labels"] + [-100] * (m - len(b["labels"])) for b in batch])
        att = torch.tensor([[1] * len(b["input_ids"]) + [0] * (m - len(b["input_ids"])) for b in batch])
        return {"input_ids": ids, "labels": lab, "attention_mask": att}

    if "qwen3_5" in MODEL.lower().replace(".", "_").replace("-", "_") or "qwen3.5" in MODEL.lower():
        # Qwen3.5 ma warstwy Gated DeltaNet: bez tych pakietów model po cichu przechodzi na wolne operacje PyTorch
        for mod, pkg in (("fla", "flash-linear-attention"), ("causal_conv1d", "causal-conv1d")):
            try:
                __import__(mod)
                print(f"szybkie jądra DeltaNet: {pkg} OK")
            except ImportError:
                print(f"UWAGA: brak {pkg} - trening będzie wyraźnie wolniejszy (pip install {pkg})")
    if QUANT == "none":
        try:
            model = AutoModelForCausalLM.from_pretrained(MODEL, device_map={"": LOCAL_RANK}, torch_dtype=torch.float16, attn_implementation="sdpa")
        except (ValueError, KeyError):  # modele multimodalne (Qwen3.5): ładujemy całość, używamy samego tekstu
            from transformers import AutoModelForMultimodalLM
            model = AutoModelForMultimodalLM.from_pretrained(MODEL, device_map={"": LOCAL_RANK}, torch_dtype=torch.float16)
        model.gradient_checkpointing_enable()
        model.enable_input_require_grads()
        targets = "all-linear"
    else:
        bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
        model = AutoModelForCausalLM.from_pretrained(MODEL, quantization_config=bnb, device_map={"": LOCAL_RANK}, torch_dtype=torch.float16, attn_implementation="sdpa")
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
        targets = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    model = get_peft_model(model, LoraConfig(r=LORA_R, lora_alpha=LORA_R * 2, lora_dropout=0.03, target_modules=targets, task_type="CAUSAL_LM"))
    if RANK == 0:
        model.print_trainable_parameters()
        print(f"karty: {WORLD}, efektywny batch: {BATCH * max(1, GRAD_ACC // WORLD) * WORLD}")

    args = TrainingArguments(
        output_dir=os.path.join(OUT_DIR, "ckpt"), per_device_train_batch_size=BATCH, per_device_eval_batch_size=1, gradient_accumulation_steps=max(1, GRAD_ACC // WORLD),
        num_train_epochs=EPOCHS, learning_rate=LR, lr_scheduler_type="cosine", warmup_ratio=0.03, weight_decay=0.0,
        fp16=True, logging_steps=10, eval_strategy="steps", eval_steps=200, save_strategy="steps", save_steps=200, save_total_limit=2,
        group_by_length=False, report_to="none", gradient_checkpointing=True, optim="paged_adamw_8bit" if QUANT != "none" else "adamw_torch", max_grad_norm=1.0, seed=SEED,
        remove_unused_columns=False, ddp_find_unused_parameters=False, gradient_checkpointing_kwargs={"use_reentrant": False},
    )
    trainer = Trainer(model=model, args=args, train_dataset=DS(train_ds), eval_dataset=DS(val_ds), data_collator=collate)
    resume = os.path.isdir(os.path.join(OUT_DIR, "ckpt")) and any(d.startswith("checkpoint") for d in os.listdir(os.path.join(OUT_DIR, "ckpt")))
    trainer.train(resume_from_checkpoint=resume or None)
    if RANK == 0:
        model.save_pretrained(os.path.join(OUT_DIR, "adapter"))
        tok.save_pretrained(os.path.join(OUT_DIR, "adapter"))
        print("adapter zapisany:", os.path.join(OUT_DIR, "adapter"))


if __name__ == "__main__":
    main()
