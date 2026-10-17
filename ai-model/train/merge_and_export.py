"""Scala adapter LoRA z modelem bazowym i zapisuje model HF (do konwersji na GGUF).

  python merge_and_export.py            # czyta ADAPTER_DIR, zapisuje do OUT_DIR/merged
Potem (llama.cpp): patrz ai-model/README.md, krok 5.
"""
import os

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE = os.environ.get("BASE_MODEL", "Qwen/Qwen3-4B-Instruct-2507")
ADAPTER = os.environ.get("ADAPTER_DIR", "/kaggle/working/predator-ai/adapter")
OUT = os.environ.get("OUT_DIR", "/kaggle/working/predator-ai") + "/merged"

tok = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16, device_map={"": "cpu"})
model = PeftModel.from_pretrained(model, ADAPTER)
model = model.merge_and_unload()
model.save_pretrained(OUT, safe_serialization=True)
tok.save_pretrained(OUT)
print("zapisano:", OUT)
