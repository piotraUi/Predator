@echo off
chcp 65001 >nul
rem Pobiera nowa wersje Predatora z GitHuba (potem uruchom ponownie start-server.bat).
rem Latwiej: panel admina - Serwer - "Aktualizuj".
cd /d "%~dp0"
git pull --ff-only || (echo Nie udalo sie pobrac zmian & pause & exit /b 1)
call npm install --no-audit --no-fund
call npm run build
echo Gotowe - uruchom ponownie start-server.bat
pause
