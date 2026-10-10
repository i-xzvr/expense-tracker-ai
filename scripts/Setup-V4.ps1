[CmdletBinding()]
param(
    [ValidateSet('qwen3.5:4b','qwen3.5:2b')][string]$Model = 'qwen3.5:4b',
    [switch]$NoAI, [switch]$SkipAgent, [switch]$NonInteractive,
    [switch]$NoStart, [switch]$NoBrowser
)
. (Join-Path $PSScriptRoot 'V4.Common.ps1')
$lock = $null
$previousPath = $env:PATH
$previousBash = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_GIT_BASH_PATH','Process')
$previousUpdates = [Environment]::GetEnvironmentVariable('DISABLE_AUTOUPDATER','Process')
try {
    Assert-V3Windows
    Initialize-V3Folders
    $lock = [IO.File]::Open((Join-Path $script:V3Runtime 'v4-setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    foreach ($name in @('app','ollama','v4-services')) {
        if (Test-V3ProcessIdentity (Get-V3ProcessRecord $name)) { throw 'This copy is running. Run Stop-V4.cmd before setup or updates.' }
    }
    foreach ($port in @(3103,3105,11435)) {
        if (Test-V3Port $port) { throw "Port $port is occupied. Stop the other application/copy before installing. No process was stopped." }
    }
    if (-not $NonInteractive) {
        Write-Host 'V4 local setup. Downloads are pinned and verified; no administrator account or global PATH changes are needed.'
        if (-not $NoAI) { $NoAI = (Read-Host 'Install local Ollama AI (several GB)? [Y/n]') -match '^(n|no)$' }
        if (-not $NoAI) {
            if ((Read-Host 'Use the smaller 2B model instead of 4B? [y/N]') -match '^(y|yes)$') { $Model = 'qwen3.5:2b' }
        }
        if (-not $SkipAgent) { $SkipAgent = (Read-Host 'Install Claude coding jobs (requires your Claude Code account)? [Y/n]') -match '^(n|no)$' }
    }
    foreach ($config in @('settings.json','v4-settings.json','state/installation.json')) { Backup-V4Config (Join-Path $script:V3Runtime $config) }
    # Bootstrap only Node before npm/Git setup. V3 owns checksum/model installation.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Setup-V3.ps1') -RuntimeOnly -NoAI -Model $Model
    if ($LASTEXITCODE -ne 0) { throw 'Portable Node bootstrap failed.' }
    $node = Get-V3Node
    $npm = Join-Path ([IO.Path]::GetDirectoryName($node)) 'node_modules/npm/bin/npm-cli.js'
    $archive = Join-Path $script:V3Runtime 'downloads/PortableGit-2.56.0.2-64-bit.7z.exe'
    Get-V3VerifiedDownload $script:V4Tools.git.url $archive $script:V4Tools.git.sha256
    $gitDirectory = Join-Path $script:V3Runtime $script:V4Tools.git.directory
    $gitMarker = Join-Path $gitDirectory '.archive-sha256'
    if (-not (Test-Path -LiteralPath (Join-Path $gitDirectory 'cmd/git.exe')) -or -not (Test-Path -LiteralPath $gitMarker)) {
        Write-Host 'Extracting portable Git (many small files; allow several minutes)...'
        # This release supports -o. Older documented -InstallPath switches are
        # ignored by its SFX, so verify the actual destination before accepting.
        $extract = Start-Process -FilePath $archive -ArgumentList @('-y',('-o"' + $gitDirectory + '"')) -WindowStyle Hidden -PassThru
        if (-not $extract.WaitForExit(600000)) { $extract.Kill(); throw 'Portable Git extraction timed out after ten minutes.' }
        if ($extract.ExitCode -ne 0) { throw 'Portable Git extraction failed.' }
        if (-not (Test-Path -LiteralPath (Join-Path $gitDirectory 'cmd/git.exe')) -or -not (Test-Path -LiteralPath (Join-Path $gitDirectory 'bin/bash.exe'))) { throw 'Portable Git did not extract into the required destination.' }
        [IO.File]::WriteAllText($gitMarker,$script:V4Tools.git.sha256)
    }
    $git = Get-V4Git
    $gitVersion = & $git --version
    if ($LASTEXITCODE -ne 0 -or $gitVersion -ne "git version $($script:V4Tools.git.version)") { throw 'Portable Git version verification failed.' }
    $env:PATH = [IO.Path]::GetDirectoryName($node) + ';' + [IO.Path]::GetDirectoryName($git) + ';' + $previousPath
    $env:CLAUDE_CODE_GIT_BASH_PATH = Join-Path $gitDirectory 'bin/bash.exe'
    $env:DISABLE_AUTOUPDATER = '1'
    if (-not $SkipAgent) {
        $agentRoot = Join-Path $script:V3Runtime 'claude'
        New-Item -ItemType Directory -Force -Path $agentRoot | Out-Null
        Copy-Item -LiteralPath (Join-Path $script:V3Root 'config/claude-runtime/package.json') -Destination $agentRoot
        Copy-Item -LiteralPath (Join-Path $script:V3Root 'config/claude-runtime/package-lock.json') -Destination $agentRoot
        & $node $npm ci --prefix $agentRoot --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Pinned Claude installation failed.' }
        $native = Get-V4Claude
        if (-not $native) { throw 'Claude native executable is missing after installation.' }
        $version = & $native --version
        if ($LASTEXITCODE -ne 0 -or $version -notlike "$($script:V4Tools.claudeVersion) *") { throw 'Claude version does not match the pinned release.' }
        if (-not (Get-V4ClaudeAuth $native)) {
            if ($NonInteractive) { throw 'Claude login is required. Rerun interactive Setup-V4.cmd, or select -SkipAgent for a working finance-only installation.' }
            Write-Host 'Complete your own Claude sign-in in the browser. Passwords and account tokens are never requested by V4.'
            & $native auth login
            if ($LASTEXITCODE -ne 0 -or -not (Get-V4ClaudeAuth $native)) { throw 'Claude sign-in did not complete. Rerun setup or choose -SkipAgent.' }
        }
    }
    if (-not $NonInteractive) {
        if ((Read-Host 'Configure an installed OneDrive folder override? [y/N]') -match '^(y|yes)$') {
            $syncRoot = Read-Host 'Existing signed-in OneDrive sync folder (absolute path)'
            if (-not [IO.Path]::IsPathRooted($syncRoot) -or -not (Test-Path -LiteralPath $syncRoot -PathType Container)) { throw 'OneDrive folder must exist and be an absolute path.' }
            Set-V4EnvironmentValue 'V4_ONEDRIVE_ROOT' ([IO.Path]::GetFullPath($syncRoot))
        }
        if ((Read-Host 'Configure optional Microsoft Graph device sign-in? [y/N]') -match '^(y|yes)$') {
            $clientId = Read-Host 'Public Microsoft application/client ID'
            if ($clientId -notmatch '^[a-fA-F0-9-]{36}$') { throw 'Microsoft application ID must be a UUID.' }
            Set-V4EnvironmentValue 'V4_MS_CLIENT_ID' $clientId
            $tenant = Read-Host 'Tenant (Enter for consumers)'
            if (-not $tenant) { $tenant = 'consumers' }
            Set-V4EnvironmentValue 'V4_MS_TENANT' $tenant
        }
        if ((Read-Host 'Configure optional Google Sheets OAuth refresh credentials? [y/N]') -match '^(y|yes)$') {
            Set-V4EnvironmentValue 'V4_GOOGLE_CLIENT_ID' (Read-Host 'Google OAuth client ID')
            Set-V4EnvironmentValue 'V4_GOOGLE_CLIENT_SECRET' (Read-V4Secret 'Google OAuth client secret')
            Set-V4EnvironmentValue 'V4_GOOGLE_REFRESH_TOKEN' (Read-V4Secret 'Google OAuth refresh token')
        }
    }
    # A GitHub ZIP has no .git. Create a source-only baseline for isolated jobs.
    # Never initialize/commit through an enclosing repository or use global identity.
    if (-not (Test-Path -LiteralPath (Join-Path $script:V3Root '.git'))) {
        & $git -C $script:V3Root init --initial-branch=main
        if ($LASTEXITCODE -ne 0) { throw 'ZIP source Git initialization failed.' }
        & $git -C $script:V3Root add --all
        if ($LASTEXITCODE -ne 0) { throw 'Source baseline staging failed.' }
        & $git -C $script:V3Root -c user.name='V4 Local Setup' -c user.email='local-setup@example.invalid' commit -m 'Initialize downloaded V4 source'
        if ($LASTEXITCODE -ne 0) { throw 'Source baseline commit failed.' }
    }
    & $git -C $script:V3Root rev-parse --verify HEAD *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Source repository needs a committed HEAD before coding jobs can run.' }
    [IO.File]::WriteAllText((Join-Path $script:V3Runtime 'v4-settings.json'), (@{agentEnabled=(-not [bool]$SkipAgent)} | ConvertTo-Json))
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Setup-V3.ps1'),'-Model',$Model)
    if ($NoAI) { $arguments += '-NoAI' }
    & powershell.exe @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Application/model install and required checks failed.' }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Test-V4Readiness.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'V4 readiness failed.' }
    # Release the installer lock before starting; Start-V4 refuses concurrent setup.
    $lock.Dispose(); $lock = $null
    if (-not $NoStart) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Start-V4.ps1') -NoBrowser
        if ($LASTEXITCODE -ne 0) { throw 'V4 startup verification failed.' }
        $status = Invoke-RestMethod 'http://127.0.0.1:3103/api/ai/status' -TimeoutSec 15
        if (-not $NoAI -and -not $status.modelReady) { throw 'Local model is not ready after startup.' }
        & $node (Join-Path $PSScriptRoot 'smoke-v4.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'Live V4/PDF acceptance failed.' }
    }
    @{completedAt=[DateTime]::UtcNow.ToString('o');version='0.4.0';checksPassed=$true;started=(-not [bool]$NoStart);localAI=(-not [bool]$NoAI);agent=(-not [bool]$SkipAgent)} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:V3Runtime 'state/installation.json') -Encoding UTF8
    Write-Host 'V4 installation and checks passed. Start-V4.cmd opens the app; Stop-V4.cmd stops this copy. See docs/v4-installation.md.'
    if (-not $NoStart -and -not $NoBrowser) { Start-Process $script:V3Config.appUrl }
    exit 0
} catch {
    Write-Error $_ -ErrorAction Continue
    Write-Host 'Setup is incomplete. Correct the reported error and rerun. Verified downloads are reused. Configuration backups are in .runtime/config-backups. Stop-V4.cmd stops runtimes started by setup.'
    exit 1
} finally {
    if ($null -ne $lock) { $lock.Dispose() }
    $env:PATH = $previousPath
    [Environment]::SetEnvironmentVariable('CLAUDE_CODE_GIT_BASH_PATH',$previousBash,'Process')
    [Environment]::SetEnvironmentVariable('DISABLE_AUTOUPDATER',$previousUpdates,'Process')
}
