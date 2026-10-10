[CmdletBinding()]
param([switch]$NoAI,[switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'V4.Common.ps1')
$startupLock = $null
try {
  Assert-V3Windows
  Initialize-V3Folders
  $node = Get-V3Node
  $startupLock = [IO.File]::Open((Join-Path $script:V3Runtime 'v4-setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  foreach ($pair in @(@('app',3103),@('v4-services',3105),@('ollama',11435))) {
    if ((Test-V3Port $pair[1]) -and -not (Test-V3ProcessIdentity (Get-V3ProcessRecord $pair[0]))) { throw "Port $($pair[1]) is occupied by another process/copy. It will not be reused or stopped." }
  }
  $native = ''; $version = 'disabled'; $git = ''
  if ((Get-V4Settings).agentEnabled) {
    $candidate = Get-V4Claude
    if ($candidate) {
      $version = & $candidate --version
      if ($LASTEXITCODE -ne 0 -or $version -notlike "$(Get-V4ClaudeVersion) *") { throw 'Claude version check failed. Rerun Setup-V4.cmd.' }
      if (Get-V4ClaudeAuth $candidate) { $native = $candidate; $git = Get-V4Git }
    }
    if (-not $native) { Write-Host 'Claude is unavailable or signed out. Coding jobs are disabled; rerun Setup-V4.cmd to connect them. Finance and scheduling will start.' }
  }
  $tokenPath = Join-Path $script:V3Runtime 'v4-services-token'
  if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [IO.File]::WriteAllText($tokenPath, [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant())
  }
  $tsx = Join-Path $script:V3Root 'node_modules/tsx/dist/cli.mjs'
  $serviceScript = Join-Path $script:V3Root 'scripts/v4/services.ts'
  $serviceEnvironment = @{ V4_CLAUDE_EXE=$native; V4_GIT_EXE=$git; V4_REPOSITORY=$script:V3Root; V4_SERVICES_TOKEN_PATH=$tokenPath; NEXT_TELEMETRY_DISABLED='1'; DISABLE_AUTOUPDATER='1' }
  if ($env:CLAUDE_CONFIG_DIR) { $serviceEnvironment.CLAUDE_CONFIG_DIR = $env:CLAUDE_CONFIG_DIR }
  if ($git) {
    $serviceEnvironment.PATH = [IO.Path]::GetDirectoryName($git) + ';' + $env:PATH
    $bash = Join-Path $script:V3Runtime "$($script:V4Tools.git.directory)/bin/bash.exe"
    if (Test-Path -LiteralPath $bash) { $serviceEnvironment.CLAUDE_CODE_GIT_BASH_PATH = $bash }
  }
  $null = Start-V3OwnedProcess 'v4-services' $node @($tsx,$serviceScript) $serviceEnvironment 3105
  $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Start-V3.ps1'),'-NoBrowser')
  if ($NoAI) { $arguments += '-NoAI' }
  & powershell.exe @arguments
  if ($LASTEXITCODE -ne 0) { throw 'The application did not start. Check .runtime/logs.' }
  $headers = @{ Authorization = 'Bearer ' + [IO.File]::ReadAllText($tokenPath).Trim() }
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    try { $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:3105/health' -Headers $headers -TimeoutSec 2; break }
    catch { if ([DateTime]::UtcNow -ge $deadline) { throw }; Start-Sleep -Milliseconds 500 }
  } while ($true)
  if (-not $ready.ready) { throw 'V4 services are not ready.' }
  Write-Host "V4 app and coding/scheduling services are running at $($script:V3Config.appUrl). Claude: $version"
  if (-not $NoBrowser) { Start-Process $script:V3Config.appUrl }
  exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
finally { if ($null -ne $startupLock) { $startupLock.Dispose() } }
