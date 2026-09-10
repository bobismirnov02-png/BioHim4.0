@echo off
cd /d "%~dp0"
set PORT=8787
set HOST=127.0.0.1
node server.js
pause
