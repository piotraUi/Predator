@echo off
chcp 65001 >nul
title Serwer Predator
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Brak Node.js! Zainstaluj Node.js 22 lub nowszy ze strony https://nodejs.org
  pause
  exit /b 1
)
rem Po aktualizacji z panelu admina serwer sam sie wylacza, a ten skrypt instaluje,
rem buduje i uruchamia nowa wersje.
set PREDATOR_SUPERVISED=1
if "%DATA_DIR%"=="" (set "FLAG=data\.restart") else (set "FLAG=%DATA_DIR%\.restart")
:loop
if exist "%FLAG%" del "%FLAG%"
echo Instaluje biblioteki...
call npm install --no-audit --no-fund
echo Buduje gre...
call npm run build
call npm start
if "%errorlevel%"=="75" goto restart
if exist "%FLAG%" goto restart
echo Serwer zatrzymany.
pause
exit /b 0
:restart
echo == Aktualizacja - uruchamiam serwer ponownie ==
goto loop
