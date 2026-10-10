[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'V4.Common.ps1')
try {
    Assert-V3Windows
    $node = Get-V3Node
    if (-not (Test-Path -LiteralPath (Join-Path $script:V3Root '.next/BUILD_ID'))) { throw 'Production build missing. Run Setup-V4.cmd.' }
    $git = Get-V4Git
    $gitVersion = & $git --version
    if ($LASTEXITCODE -ne 0) { throw 'Git does not launch.' }
    & $git -C $script:V3Root rev-parse --verify HEAD *> $null
    if ($LASTEXITCODE -ne 0) { throw 'The source needs a committed Git HEAD.' }
    $settings = Get-V3Settings
    if (-not $settings.noAI) { Assert-V3ModelFiles $settings.model }
    $agent = (Get-V4Settings).agentEnabled
    $version = 'disabled'; $loggedIn = $false
    if ($agent) {
        $native = Get-V4Claude
        if (-not $native) { throw 'Pinned Claude is missing. Rerun Setup-V4.cmd.' }
        $version = & $native --version
        if ($LASTEXITCODE -ne 0 -or $version -notlike "$(Get-V4ClaudeVersion) *") { throw 'Claude executable/version verification failed.' }
        $loggedIn = Get-V4ClaudeAuth $native
        if (-not $loggedIn) { throw 'Claude is signed out. Rerun interactive Setup-V4.cmd or run scripts/Claude-V4.ps1 auth login.' }
    }
    [PSCustomObject]@{ WindowsX64=$true;Node=(& $node --version);Git=$gitVersion;Claude=$version;ClaudeLoggedIn=$loggedIn;LocalAIEnabled=(-not [bool]$settings.noAI);LocalModel=$settings.model;ModelFilesVerified=(-not [bool]$settings.noAI) }
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
