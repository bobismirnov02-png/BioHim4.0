@echo off
setlocal
cd /d "%~dp0"
title BioHim 4.0.2
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN_BIOHIM_SERVER.ps1"
endlocal
