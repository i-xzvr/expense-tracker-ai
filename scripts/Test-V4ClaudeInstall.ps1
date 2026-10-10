# Opt-in real package installation with an isolated unsigned-in Claude profile.
# Uses network/npm cache; never authenticates, creates accounts or spends usage.
param([string]$PriorVersion='2.1.295')
. (Join-Path $PSScriptRoot 'V4.Common.ps1')
$node=Get-V3Node
$npm=Join-Path ([IO.Path]::GetDirectoryName($node)) 'node_modules/npm/bin/npm-cli.js'
$fixture=Join-Path $script:V3Root ('work/claude clean install/' + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path (Join-Path $fixture 'config/claude-runtime') | Out-Null
Copy-Item -LiteralPath (Join-Path $script:V3Root 'config/claude-runtime/package.json'),(Join-Path $script:V3Root 'config/claude-runtime/package-lock.json') -Destination (Join-Path $fixture 'config/claude-runtime')
$script:V3Root=$fixture; $script:V3Runtime=Join-Path $fixture '.runtime'
Initialize-V3Folders
$previousProfile=[Environment]::GetEnvironmentVariable('CLAUDE_CONFIG_DIR','Process')
$previousUpdates=[Environment]::GetEnvironmentVariable('DISABLE_AUTOUPDATER','Process')
try {
    $env:CLAUDE_CONFIG_DIR=Join-Path $fixture 'unsigned-in profile'
    $env:DISABLE_AUTOUPDATER='1'
    $native=Install-V4Claude $node $npm $PriorVersion
    $native=Install-V4Claude $node $npm $script:V4Tools.claudeVersion
    $backups=@(Get-ChildItem -LiteralPath (Join-Path $script:V3Runtime 'tool-backups') -Directory)
    if ($backups.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $backups[0].FullName 'node_modules/@anthropic-ai/claude-code/bin/claude.exe'))) { throw 'The prior managed CLI was not retained for rollback.' }
    if (-not (Test-Path -LiteralPath $native)) { throw 'Fresh native CLI missing.' }
    if (Get-V4ClaudeAuth $native) { throw 'The isolated profile unexpectedly has credentials; no signed-out claim can be made.' }
    $denied=$false
    try { $null=Connect-V4Claude $native $true $true $true } catch { $denied=$true }
    if (-not $denied) { throw 'Unattended unsigned-in installation must not enable coding jobs.' }
    $reused=Install-V4Claude $node $npm $script:V4Tools.claudeVersion
    if ($reused -ne $native) { throw 'Current managed copy was not reused.' }
    Write-Host 'PASS fresh Claude install, older-version update with retained rollback copy, native version/worker flag checks, isolated unsigned-in profile, login rejection and current-version reuse. No live provider job was executed.'
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
finally {
    [Environment]::SetEnvironmentVariable('CLAUDE_CONFIG_DIR',$previousProfile,'Process')
    [Environment]::SetEnvironmentVariable('DISABLE_AUTOUPDATER',$previousUpdates,'Process')
}
