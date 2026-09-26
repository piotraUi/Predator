#!/usr/bin/env bash
# Pobiera nową wersję Predatora z GitHuba (serwer trzeba potem uruchomić ponownie: start-server.sh).
# Łatwiej: panel admina → Serwer → "Aktualizuj".
cd "$(dirname "$0")"
git pull --ff-only && npm install --no-audit --no-fund && npm run build && echo "Gotowe - uruchom ponownie start-server.sh"
