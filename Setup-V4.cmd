@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Setup-V4.ps1" %*
exit /b %ERRORLEVEL%
