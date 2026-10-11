@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Trailer Predatora ===
where node >nul 2>nul || (echo Brak Node.js - zainstaluj z https://nodejs.org i uruchom ponownie & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo Brak ffmpeg - w terminalu: winget install Gyan.FFmpeg  ^(potem otworz nowe okno^) & pause & exit /b 1)
if not defined RES set RES=1080
if not defined FPS set FPS=30
if not exist node_modules (
  echo [1/4] Instaluje Playwright i Chromium...
  call npm install || (pause & exit /b 1)
  call npx playwright install chromium || (pause & exit /b 1)
)
echo [2/4] Muzyka...
node music.mjs predator-music.wav || (pause & exit /b 1)
echo [3/4] Klatki na karcie graficznej (RES=%RES% FPS=%FPS%)...
node render.mjs || (pause & exit /b 1)
echo [4/4] Skladam wideo...
ffmpeg -y -framerate %FPS% -i frames/f%%05d.jpg -i predator-music.wav -af "alimiter=limit=0.95" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart Predator-trailer.mp4 || (pause & exit /b 1)
echo.
echo GOTOWE: %~dp0Predator-trailer.mp4
pause
