@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || set "PATH=%~dp0.tools\node-v26.13.0-win-x64;%PATH%"
if not exist node_modules call npm install
if not exist dist\index.html call npm run build
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start "" http://127.0.0.1:8787"
call npm start
