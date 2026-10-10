@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Setup-V3.ps1" %*
if not "%ERRORLEVEL%"=="0" exit /b %ERRORLEVEL%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Test-V4Readiness.ps1"
exit /b %ERRORLEVEL%
