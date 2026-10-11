@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Trailer Apex ===
where node >nul 2>nul || (echo Brak Node.js - zainstaluj z https://nodejs.org i uruchom ponownie & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo Brak ffmpeg - w terminalu: winget install Gyan.FFmpeg  ^(potem otworz nowe okno^) & pause & exit /b 1)
if not exist node_modules (
  echo [1/4] Instaluje Playwright...
  call npm install || (pause & exit /b 1)
  call npx playwright install chromium || (pause & exit /b 1)
)
echo [2/4] Muzyka...
node music.mjs apex-music.wav || (pause & exit /b 1)
echo [3/4] Klatki (karta graficzna)...
node render.mjs || (pause & exit /b 1)
echo [4/4] Skladam wideo...
ffmpeg -y -framerate 30 -i frames/f%%05d.jpg -i apex-music.wav -af "alimiter=limit=0.95" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart Apex-trailer.mp4 || (pause & exit /b 1)
echo.
echo GOTOWE: %~dp0Apex-trailer.mp4
pause
