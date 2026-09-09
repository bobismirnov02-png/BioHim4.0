@echo off
setlocal
cd /d "%~dp0"
title BioHim 4.1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_BIOHIM.ps1"
endlocal
