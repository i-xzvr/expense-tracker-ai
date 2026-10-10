# Offline checks of portability and credential configuration; isolated private fixture.
. (Join-Path $PSScriptRoot 'V4.Common.ps1')
$fixture = Join-Path $script:V3Root ('work/v4 installer checks/' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $fixture | Out-Null
$script:V3Root = $fixture
$script:V3Runtime = Join-Path $fixture '.runtime'
Initialize-V3Folders
$count = 0
function Assert-V4Installer([bool]$Condition,[string]$Message) {
    if (-not $Condition) { throw $Message }; $script:count++; Write-Host "PASS $Message"
}
try {
    Assert-V4Installer (-not (Get-V4Settings).agentEnabled) 'A fresh copy defaults to disabled coding jobs.'
    $environment = Join-Path $fixture '.env.local'
    [IO.File]::WriteAllText($environment,"# retained comment`nV4_MS_TENANT='consumers'`nOTHER_SETTING='preserved'`n")
    Set-V4EnvironmentValue 'V4_ONEDRIVE_ROOT' 'C:\Synthetic Folder\new folder'
    $text = [IO.File]::ReadAllText($environment)
    Assert-V4Installer ($text.Contains("OTHER_SETTING='preserved'") -and $text.Contains('# retained comment')) 'Unrelated environment settings and comments survive updates.'
    Assert-V4Installer ($text.Contains("V4_ONEDRIVE_ROOT='C:\Synthetic Folder\new folder'")) 'Windows paths with spaces/backslashes are retained literally.'
    Set-V4EnvironmentValue 'V4_MS_TENANT' 'organizations'
    $text = [IO.File]::ReadAllText($environment)
    Assert-V4Installer (([regex]::Matches($text,'V4_MS_TENANT=')).Count -eq 1 -and $text.Contains("V4_MS_TENANT='organizations'")) 'Updating a selected setting cannot create duplicate assignments.'
    $backups = @(Get-ChildItem -LiteralPath (Join-Path $script:V3Runtime 'config-backups'))
    Assert-V4Installer ($backups.Count -eq 2) 'Each existing environment file is backed up before mutation.'
    $prior = [IO.File]::ReadAllText($environment)
    $rejected = $false
    try { Set-V4EnvironmentValue 'V4_MS_TENANT' "invalid`nSECOND_SETTING=bad" } catch { $rejected = $true }
    Assert-V4Installer ($rejected -and [IO.File]::ReadAllText($environment) -eq $prior) 'Multiline environment injection is rejected without changing configuration.'
    New-Item -ItemType Directory -Force -Path (Join-Path $script:V3Runtime 'claude/node_modules/@anthropic-ai/claude-code/bin') | Out-Null
    $expected = Join-Path $script:V3Runtime 'claude/node_modules/@anthropic-ai/claude-code/bin/claude.exe'
    [IO.File]::WriteAllText($expected,'fixture only - not executable')
    Assert-V4Installer ((Get-V4Claude) -eq $expected) 'Claude discovery is project-relative, independent of the source laptop username.'
    Write-Host "$count V4 installer checks passed. Synthetic evidence remains under ignored work/."
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
