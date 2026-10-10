# Shared, project-relative runtime discovery; no permanent PATH changes.
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
$script:V4Tools = Get-Content -LiteralPath (Join-Path $script:V3Root 'config/v4-tools.json') -Raw | ConvertFrom-Json
function Get-V4Git {
    $portable = Join-Path $script:V3Runtime "$($script:V4Tools.git.directory)/cmd/git.exe"
    if (Test-Path -LiteralPath $portable) { return $portable }
    $installed = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($installed) { return $installed.Source }
    throw 'Git is missing. Run Setup-V4.cmd to install the verified portable copy.'
}
function Get-V4Claude {
    $native = Join-Path $script:V3Runtime 'claude/node_modules/@anthropic-ai/claude-code/bin/claude.exe'
    if (Test-Path -LiteralPath $native) { return $native }
    return $null
}
function Get-V4Settings {
    $path = Join-Path $script:V3Runtime 'v4-settings.json'
    if (Test-Path -LiteralPath $path) { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
    return [PSCustomObject]@{ agentEnabled = $false }
}
function Get-V4ClaudeAuth([string]$Executable) {
    $raw = & $Executable auth status 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    try { return [bool](($raw -join "`n" | ConvertFrom-Json).loggedIn) } catch { return $false }
}
function Backup-V4Config([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $directory = Join-Path $script:V3Runtime 'config-backups'
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    Copy-Item -LiteralPath $Path -Destination (Join-Path $directory (([IO.Path]::GetFileName($Path)) + '.' + [guid]::NewGuid().ToString() + '.bak'))
}
function Set-V4EnvironmentValue([string]$Name, [string]$Value) {
    if ($Name -notmatch '^V4_[A-Z_]+$' -or $Value -match "[\r\n']") { throw 'Environment values must be single-line and cannot contain a single quote.' }
    $path = Join-Path $script:V3Root '.env.local'
    Backup-V4Config $path
    $lines = @()
    if (Test-Path -LiteralPath $path) { $lines = @([IO.File]::ReadAllLines($path) | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($Name) + '\s*=') }) }
    $lines += "$Name='$Value'"
    [IO.File]::WriteAllLines($path, $lines, (New-Object Text.UTF8Encoding($false)))
}
function Read-V4Secret([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}
