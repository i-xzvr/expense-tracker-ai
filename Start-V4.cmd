@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-V4.ps1" %*
set "v4Exit=%ERRORLEVEL%"
if not "%v4Exit%"=="0" pause
exit /b %v4Exit%

