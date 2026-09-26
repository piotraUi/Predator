#!/usr/bin/env bash
# Uruchamia serwer gry Predator (Linux / macOS).
# Po aktualizacji z panelu admina serwer sam się wyłącza, a ten skrypt instaluje,
# buduje i uruchamia nową wersję.
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Brak Node.js! Zainstaluj Node.js 22 lub nowszy: https://nodejs.org"
  exit 1
fi
export PREDATOR_SUPERVISED=1
FLAG="${DATA_DIR:-data}/.restart"
while true; do
  rm -f "$FLAG"
  npm install --no-audit --no-fund || echo "Uwaga: npm install się nie udał"
  npm run build || echo "Uwaga: budowanie gry się nie udało"
  npm start
  code=$?
  if [ "$code" = "75" ] || [ -f "$FLAG" ]; then
    echo "== Aktualizacja - uruchamiam serwer ponownie =="
    continue
  fi
  echo "Serwer zatrzymany (kod $code)."
  break
done
