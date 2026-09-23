#!/usr/bin/env bash
# Uruchamia serwer gry Predator (Linux / macOS)
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Brak Node.js! Zainstaluj Node.js 22 lub nowszy: https://nodejs.org"
  exit 1
fi
[ -d node_modules ] || npm install
npm run build
npm start
