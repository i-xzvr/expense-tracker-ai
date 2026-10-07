@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Setup-V3.ps1" %*
set "v3Exit=%ERRORLEVEL%"
if not "%v3Exit%"=="0" echo Setup failed. Read the message above; nothing is ready until setup succeeds.
pause
exit /b %v3Exit%
