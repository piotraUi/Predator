#!/usr/bin/env bash
# Linux / macOS: ./zrob-trailer.sh   (opcje: RES=1440 FPS=60 WORKERS=3)
set -e
cd "$(dirname "$0")"
RES=${RES:-1080}; FPS=${FPS:-30}; export RES FPS
[ -d node_modules ] || { npm install && npx playwright install chromium; }
node music.mjs predator-music.wav
node render.mjs
ffmpeg -y -framerate $FPS -i frames/f%05d.jpg -i predator-music.wav -af "alimiter=limit=0.95" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart Predator-trailer.mp4
echo "GOTOWE: $(pwd)/Predator-trailer.mp4"
