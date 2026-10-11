#!/usr/bin/env bash
# Linux / macOS: ./zrob-trailer.sh
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || { npm install && npx playwright install chromium; }
node music.mjs apex-music.wav
node render.mjs
ffmpeg -y -framerate 30 -i frames/f%05d.jpg -i apex-music.wav -af "alimiter=limit=0.95" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart Apex-trailer.mp4
echo "GOTOWE: $(pwd)/Apex-trailer.mp4"
