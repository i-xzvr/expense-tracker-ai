[CmdletBinding()]
param([switch]$NoAI,[switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
try {
  Assert-V3Windows
  Initialize-V3Folders
  $node = Get-V3Node
  $claude = (Get-Command claude -ErrorAction Stop).Source
  $native = Join-Path $env:USERPROFILE '.local/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe'
  if (-not (Test-Path -LiteralPath $native)) { throw 'Claude native executable missing. Run scripts/Test-V4Readiness.ps1.' }
  $version = & $native --version
  if ($LASTEXITCODE -ne 0) { throw 'Claude does not launch. Run scripts/Test-V4Readiness.ps1.' }
  $tokenPath = Join-Path $script:V3Runtime 'v4-services-token'
  if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [IO.File]::WriteAllText($tokenPath, [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant())
  }
  $tsx = Join-Path $script:V3Root 'node_modules/tsx/dist/cli.mjs'
  $serviceScript = Join-Path $script:V3Root 'scripts/v4/services.ts'
  $serviceEnvironment = @{ V4_CLAUDE_EXE=$native; V4_REPOSITORY=$script:V3Root; V4_SERVICES_TOKEN_PATH=$tokenPath; CLAUDE_CODE_GIT_BASH_PATH='C:\Program Files\Git\bin\bash.exe'; NEXT_TELEMETRY_DISABLED='1' }
  $null = Start-V3OwnedProcess 'v4-services' $node @($tsx,$serviceScript) $serviceEnvironment 3105
  $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Start-V3.ps1'),'-NoBrowser')
  if ($NoAI) { $arguments += '-NoAI' }
  & powershell.exe @arguments
  if ($LASTEXITCODE -ne 0) { throw 'The application did not start. Check .runtime/logs.' }
  $headers = @{ Authorization = 'Bearer ' + [IO.File]::ReadAllText($tokenPath).Trim() }
  $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:3105/health' -Headers $headers -TimeoutSec 15
  if (-not $ready.ready) { throw 'V4 services are not ready.' }
  Write-Host "V4 app and coding/scheduling services are running at $($script:V3Config.appUrl). Claude: $version"
  if (-not $NoBrowser) { Start-Process $script:V3Config.appUrl }
  exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
