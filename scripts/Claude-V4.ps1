# Invoke the pinned project-local Claude CLI, including its interactive login.
. (Join-Path $PSScriptRoot 'V4.Common.ps1')
$native = Get-V4Claude
if (-not $native) { throw 'Claude is not installed in this project. Run Setup-V4.cmd without -SkipAgent.' }
$git = Get-V4Git
$env:PATH = [IO.Path]::GetDirectoryName($git) + ';' + $env:PATH
$env:CLAUDE_CODE_GIT_BASH_PATH = Join-Path $script:V3Runtime "$($script:V4Tools.git.directory)/bin/bash.exe"
$env:DISABLE_AUTOUPDATER = '1'
& $native @args
exit $LASTEXITCODE
