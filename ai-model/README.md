# Własny asystent AI Predatora

Mały model językowy (LLM), który zastępuje Gemini w Studio: **buduje mapy 3D, pisze skrypty Lua, rozmawia po polsku i po angielsku** i wie, co to hulajnoga, checkpoint czy tycoon. Trenujesz go sam na Kaggle, a potem uruchamiasz na swoim komputerze lub serwerze.

## Co to jest i ile to zajmuje pamięci

| | |
|---|---|
| Typ | LLM (transformer), **Qwen3-4B-Instruct** (4 mld parametrów, licencja Apache 2.0), doszkolony metodą **QLoRA** (model zamrożony w 4 bitach + mała nakładka LoRA) |
| Trening na Kaggle | GPU T4 albo P100 (16 GB): zużywa ok. 10-14 GB VRAM |
| Działanie (Q4_K_M, llama.cpp) | plik ~2,5 GB; **~3-4 GB VRAM** (albo ~4-5 GB RAM na samym CPU) |
| Szybkość | GPU 6-8 GB: 50-100 tokenów/s; sam CPU: 5-15 tokenów/s (wolno przy dużych mapach) |
| Nowszy model (Qwen3.5-4B) | `BASE_MODEL=Qwen/Qwen3.5-4B QUANT=none` + w komórce 1 `pip install -U transformers` (wymaga v5). Unsloth odradza QLoRA 4-bit dla Qwen3.5, więc trenujemy LoRA na wagach fp16 (więcej VRAM, ok. 12-15 GB, wolniej). Szablon z `<think>` jest obsłużony (`enable_thinking=False`), `--selftest` przeszedł na prawdziwym tokenizerze. **Nieprzetestowane na GPU**; do GGUF potrzebny świeży llama.cpp |
| Mniejsza wersja | `BASE_MODEL=Qwen/Qwen3-1.7B` (~1,3 GB, szybsza, ale słabsza w budowaniu) |

Odpowiedź modelu nie jest JSON-em, tylko zwartym tekstem (ok. 2× mniej tokenów, więc szybciej):

```
Buduję w punkcie (0, 0), rzut ok. 17×18.
<parts model="Dom" at="0,0" yaw="90">
b|Podłoga|0|0.3|0|13|0.6|12|#b9a58a|tex=planks
b|Ściana|-3.1|5.6|-5.5|1.3|10|1|#ff69b4
...
</parts>
<script name="Lawa">
onTouch("Lawa", function(player) kill(player) end)
</script>
```

Współrzędne w bloku `<parts>` są **lokalne** (środek budowli w (0,0), ziemia na y=0). Serwer sam przesuwa je do punktu `at` i obraca o `yaw`, więc model nie musi liczyć pozycji w świecie.

## Co umie (dane treningowe)

Wszystko generuje kod z tego katalogu; **każda mapa i każdy skrypt są sprawdzane przed dodaniem do danych**:

- **74 rodzaje budowli** (`gen/structures*.ts`): domy, zamki, wieże, mosty, drzewa, pojazdy (hulajnoga, rower, motocykl, samolot, helikopter, pociąg, autobus, rakieta, czołg, UFO, statek...), meble, szkoła, kościół, sklep, basen, boiska, diabelski młyn, katapulta, robot, bałwan, portal, obby, areny, labirynty, tory wyścigowe, wieżowce, wyspy... Walidator (`gen/validate.ts`) odrzuca klocki wiszące w powietrzu, nakładające się, poza mapą i pod ziemią.
- **Sceny** (`gen/scenes.ts`): wioska, park, obóz, plac zabaw, farma, port, zamek z miasteczkiem - budowle rozmieszczone bez nakładania się, frontem do środka.
- **Gęste miasta i wioski** (`gen/scenes2.ts`): równoległe ulice z chodnikami, budynki po obu stronach frontem do jezdni (wieżowce, sklepy, szkoła, kościół, domy w kilku wariantach), drzewa i lampy w przerwach. Każdy rodzaj budynku jest zapisany **raz** i ustawiony wiele razy: `<parts model="Dom" at="10,20;10,50;10,80" yaw="90;90;90">` - dzięki temu całe miasto mieści się w kilku tysiącach tokenów.
- **Rozmowy wieloetapowe** (`gen/multi.ts`): „zrób dom” → „dodaj garaż obok” → „pomaluj dach na szary” → „dodaj 4 lampy przed domem” (dobudówki, zmiana koloru, usunięcie, przesunięcie, rzędy powielonych elementów); wszystko na prawdziwych narzędziach, więc nazwy klocków i wyniki są prawdziwe.
- **55 mechanik Lua** (`gen/lua.ts`, `gen/lua2.ts`, `gen/lua3.ts`): lawa, monety, checkpointy, meta, drzwi, portale, przyspieszacze, komendy czatu, pogoda, rundy, windy, sklep i menu (GUI), drużyny, klucze, zapisywanie postępu, ranking, a w `lua3.ts` skrypty ze stanem i GUI: questy, sklep z zapisem, pasek życia, poziomy, boss, craftowanie, automat, lobby→arena, walka bronią... Każdy skrypt jest uruchamiany w prawdziwej symulacji gry (`run_test`) i trafia do danych tylko, gdy działa bez błędów i robi to, co ma.
- **Poprawki**: zmiana koloru, usuwanie, przesuwanie, dokładanie (prawdziwe narzędzia `update_parts`, `delete_parts`).
- **Wiedza i rozmowa po polsku** (`gen/knowledge.ts`): słowniczek (hulajnoga, checkpoint, tycoon, Lua, GUI... ok. 80 haseł), swobodne prośby ("chcę jeździć na hulajnodze"), małe pogawędki, porady dla twórców, wyjaśnienia Lua, odmowy niebezpiecznych próśb. Dodatkowo skrypt treningowy dokłada ok. 2500 ogólnych polskich rozmów z otwartego zbioru (`GENERAL_DATASET`), żeby model dobrze rozmawiał też o czymkolwiek innym.

## Krok po kroku

### 1. Wygeneruj dane (u siebie)

```bash
cd server
npm run ai:data -- --n 8000 --seed 1 --out ../ai-model/data      # ok. 1 minuta
```

Powstają `train.jsonl` i `val.jsonl` (średnio ~2000 tokenów na rozmowę; 8000 rozmów ≈ 16 mln tokenów). Na pierwszy trening wystarczy `--n 6000`.

Sprawdź sam zestaw (harness): `npm run ai:eval -- --gold --n 100` powinno dać ok. 98%.

### 2. Wgraj dane na Kaggle

1. Kaggle → **Datasets → New Dataset**, wgraj `train.jsonl` i `val.jsonl`, nazwij `predator-ai-data`.
2. **Notebooks → New Notebook**, dodaj ten dataset (Add Input), w prawym panelu ustaw **Accelerator: GPU T4 x2** (albo P100) i **Internet: On**.

### 3. Trening (notatnik Kaggle)

Komórka 1:

```python
!pip install -q -U transformers peft bitsandbytes accelerate datasets
!git clone -q https://github.com/piotraUi/Predator /kaggle/working/predator   # (repo prywatne? wgraj folder ai-model jako Dataset i zmień ścieżki)
```

Komórka 2 (najpierw szybki test maskowania, ok. minuty):

```python
import os
os.environ["DATA_DIR"] = "/kaggle/input/predator-ai-data"
!python /kaggle/working/predator/ai-model/train/train_kaggle.py --selftest
```

Komórka 3 (na Kaggle z dwiema kartami T4 uruchom `!torchrun --nproc_per_node 2 .../train_kaggle.py` zamiast `python` - trening idzie ok. 1,8x szybciej; właściwy trening; sesja Kaggle ma limit ~9-12 h, skrypt zapisuje punkty kontrolne co 200 kroków i wznawia je sam):

```python
os.environ.update({"EPOCHS": "2", "GENERAL_N": "2500"})
!python /kaggle/working/predator/ai-model/train/train_kaggle.py
```

Zgrubny czas na T4: ~2-4 h na epokę przy 6000 rozmowach. Jeśli zabraknie pamięci: `MAX_LEN=4096`, `LORA_R=16`.

### 4. Scal i zamień na GGUF

```python
!python /kaggle/working/predator/ai-model/train/merge_and_export.py
!bash /kaggle/working/predator/ai-model/train/export_gguf.sh /kaggle/working/predator-ai/merged
```

Pobierz `predator-Q4_K_M.gguf` z zakładki **Output** (~2,5 GB).

### 5. Uruchom model

llama.cpp (najlepsze do tego celu):

```bash
llama-server -m predator-Q4_K_M.gguf --alias predator --port 8080 -c 12288 -ngl 99
```

(`-ngl 99` = na GPU; na samym CPU pomiń). Ollama: `echo 'FROM ./predator-Q4_K_M.gguf' > Modelfile && ollama create predator -f Modelfile`.

### 6. Podłącz do Predatora

Panel admina → zakładka **AI** → **🧠 Własny model**: adres `http://127.0.0.1:8080/v1`, nazwa modelu `predator`, **Test połączenia**, potem **Używaj własnego modelu**. (Albo zmienne środowiskowe `LOCAL_LLM_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_KEY`.) Własny model obsługuje gry 3D; gry 2D, obrazy i moderacja zostają na Gemini.

### 7. Oceń i popraw (to najważniejsze)

```bash
cd server
npm run ai:eval -- --endpoint http://127.0.0.1:8080/v1 --model predator --n 60 --by-name
```

Ocena daje modelowi zadania budowania i pisania skryptów, wykonuje jego wywołania na prawdziwych narzędziach Studia i liczy odsetek zadań bez błędów (format, mapa bez pływających klocków, działające skrypty). Zobacz, co zawodzi, i **dodaj do generatorów brakujące rzeczy**, potem wygeneruj dane od nowa i trenuj dalej. Tak model staje się coraz lepszy w budowaniu.

## Jak dodać nową budowlę albo mechanikę

- **Budowla**: dopisz funkcję w `gen/structures4.ts` (klocki w układzie lokalnym, `s.stand(nazwa, x, podstawa, z, sx, sy, sz, kolor)`), zarejestruj w `gen/registry.ts`, dodaj rzeczownik w `gen/lang.ts` (odmiana) i sprawdź `npx tsx ../ai-model/gen/try.ts nazwa` (walidator). Zobacz ją w grze: `npx tsx ../ai-model/gen/preview.ts nazwa` (serwer testowy na porcie 2599).
- **Mechanika Lua**: dopisz „maker” w `gen/lua2.ts` (prośby, klocki, skrypt, test w symulacji i sprawdzenie wyniku), `npx tsx ../ai-model/gen/show-lua.ts nazwa` pokazuje, czy przechodzi.

## Ograniczenia (uczciwie)

- Model 4B świetnie odtworzy to, co widział (domy, zamki, obby, typowe skrypty), ale zupełnie nowe pomysły będą słabsze niż u dużego Gemini. Im więcej różnorodnych generatorów, tym lepiej.
- Nie widzi obrazków (dołączone zdjęcia są pomijane).
- Ogólna wiedza modelu pochodzi z Qwen3 i z małego zbioru tłumaczonych polskich instrukcji; przy poważnych pytaniach może się mylić.
- Zbiór `GENERAL_DATASET` (tłumaczone Alpaca) ma niepewną licencję i jakość: jeśli to dla Ciebie problem, ustaw `GENERAL_N=0` (model nadal rozmawia po polsku dzięki własnym rozmowom i modelowi bazowemu).
