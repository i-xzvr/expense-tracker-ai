@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-V4.ps1"
exit /b %ERRORLEVEL%

