@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run Start.cmd again.
  pause
  exit /b 1
)
node "%~dp0start-local.mjs"
if errorlevel 1 pause
