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
if not exist node_modules (
  echo Instaluje biblioteki - pierwsze uruchomienie moze chwile potrwac...
  call npm install
)
echo Buduje gre...
call npm run build
call npm start
pause
