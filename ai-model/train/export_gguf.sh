#!/usr/bin/env bash
# Zamiana scalonego modelu na GGUF (Q4_K_M ~ 2.5 GB dla Qwen3-4B). Użycie: bash export_gguf.sh /kaggle/working/predator-ai/merged
set -euo pipefail
MERGED="${1:-/kaggle/working/predator-ai/merged}"
OUT="${2:-$(dirname "$MERGED")}"
if [ ! -d llama.cpp ]; then git clone --depth 1 https://github.com/ggml-org/llama.cpp; fi
pip install -q -r llama.cpp/requirements/requirements-convert_hf_to_gguf.txt
python llama.cpp/convert_hf_to_gguf.py "$MERGED" --outtype f16 --outfile "$OUT/predator-f16.gguf"
cmake -S llama.cpp -B llama.cpp/build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF >/dev/null
cmake --build llama.cpp/build --target llama-quantize -j4
llama.cpp/build/bin/llama-quantize "$OUT/predator-f16.gguf" "$OUT/predator-Q4_K_M.gguf" Q4_K_M
rm -f "$OUT/predator-f16.gguf"
ls -lh "$OUT"/predator-Q4_K_M.gguf
