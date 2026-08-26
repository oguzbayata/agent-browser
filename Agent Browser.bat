@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden kurun.
  pause
  exit /b 1
)

node start.js
if errorlevel 1 (
  echo.
  echo Agent Browser acilamadi.
  echo Bu klasorde once su komutu calistirin: npm install
  pause
)
