@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-V3.ps1" %*
set "v3Exit=%ERRORLEVEL%"
if not "%v3Exit%"=="0" pause
exit /b %v3Exit%
