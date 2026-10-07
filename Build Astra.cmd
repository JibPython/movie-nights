@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS for Windows x64 from https://nodejs.org/ then reopen this file.
  pause
  exit /b 1
)
node scripts/build-astra.mjs
if errorlevel 1 (
  echo Build stopped. See the log path above.
  pause
  exit /b 1
)
pause
