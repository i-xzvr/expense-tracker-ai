# Destination-user onboarding and official, integrity-checked AI tool updates.
# Dot-source after V4.Common.ps1. No credentials are copied into an installation.
function Get-V4AIToolPlan([bool]$LocalAI, [bool]$Agent, [bool]$Bundled) {
    $baseline = Get-Content -LiteralPath (Join-Path $script:V3Root 'config/local-ai.json') -Raw | ConvertFrom-Json
    $plan = [ordered]@{ checkedAt=[DateTime]::UtcNow.ToString('o'); channel='bundled'; claudeVersion=$script:V4Tools.claudeVersion; ollama=$baseline.ollama }
    if ($Bundled) {
        Write-Host 'Using bundled AI tool versions. Online update checking was explicitly skipped; latest-version status is unknown.'
        return [PSCustomObject]$plan
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    if ($Agent) {
        $release = Invoke-RestMethod -Uri 'https://registry.npmjs.org/@anthropic-ai/claude-code/latest' -TimeoutSec 30
        if ($release.version -notmatch '^\d+\.\d+\.\d+$' -or $release.dist.integrity -notmatch '^sha512-') { throw 'Official Claude release metadata is invalid.' }
        if ([version]$release.version -lt [version]$script:V4Tools.claudeVersion) { throw 'Claude registry returned a version older than the supported baseline.' }
        $plan.claudeVersion = $release.version
        Write-Host "Latest stable Claude Code: $($release.version)."
    }
    if ($LocalAI) {
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/ollama/ollama/releases/latest' -Headers @{'User-Agent'='Expense-Tracker-V4-Setup'} -TimeoutSec 30
        $assets = @($release.assets | Where-Object { $_.name -eq 'ollama-windows-amd64.zip' })
        if ($release.tag_name -notmatch '^v\d+\.\d+\.\d+$' -or $release.prerelease -or $assets.Count -ne 1) { throw 'Official Ollama release metadata is invalid.' }
        $asset = $assets[0]; $version = $release.tag_name.Substring(1)
        if ($asset.digest -notmatch '^sha256:[a-f0-9]{64}$' -or $asset.browser_download_url -ne "https://github.com/ollama/ollama/releases/download/v$version/ollama-windows-amd64.zip") { throw 'Ollama archive URL or SHA256 is invalid. No archive will be executed.' }
        if ([version]$version -lt [version]$script:V3Config.ollama.version) { throw 'Ollama returned a version older than this installation. Automatic downgrades are refused.' }
        $plan.ollama = [PSCustomObject]@{version=$version;directory="ollama-$version";url=$asset.browser_download_url;sha256=$asset.digest.Substring(7);baseUrl='http://127.0.0.1:11435'}
        Write-Host "Latest stable Ollama: $version. Local Qwen models remain the verified V4 model versions."
    }
    $plan.channel = 'latest-stable'
    return [PSCustomObject]$plan
}

function Invoke-V4Claude([string]$Executable, [string[]]$Arguments) {
    # Match the worker: browser/profile login, never an inherited API key or token.
    $names = @('ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_OAUTH_TOKEN','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY','ANTHROPIC_PROFILE','ANTHROPIC_FEDERATION_RULE_ID','ANTHROPIC_ORGANIZATION_ID')
    $saved = @{}
    try {
        foreach ($name in $names) { $saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process'); [Environment]::SetEnvironmentVariable($name,$null,'Process') }
        & $Executable @Arguments
        $script:V4ClaudeExitCode = $LASTEXITCODE
    } finally { foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') } }
}

function Install-V4Claude([string]$Node, [string]$Npm, [string]$Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid Claude version.' }
    $existing = Get-V4Claude
    if ($existing) {
        $actual = Invoke-V4Claude $existing @('--version')
        if ($script:V4ClaudeExitCode -eq 0 -and $actual -like "$Version *") { Write-Host "Managed Claude Code $Version is already current."; return $existing }
        Write-Host "Updating managed Claude Code to $Version."
    } else { Write-Host "Installing managed Claude Code $Version." }
    $candidateRoot = Join-Path $script:V3Runtime ('claude-candidate-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $candidateRoot | Out-Null
    $package = Get-Content -LiteralPath (Join-Path $script:V3Root 'config/claude-runtime/package.json') -Raw | ConvertFrom-Json
    $package.dependencies.'@anthropic-ai/claude-code' = $Version
    $package.allowScripts = [PSCustomObject]@{"@anthropic-ai/claude-code@$Version"=$true}
    $package | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $candidateRoot 'package.json') -Encoding UTF8
    if ($Version -eq $script:V4Tools.claudeVersion) {
        Copy-Item -LiteralPath (Join-Path $script:V3Root 'config/claude-runtime/package-lock.json') -Destination $candidateRoot
        & $Node $Npm ci --prefix $candidateRoot --registry=https://registry.npmjs.org --no-fund | Out-Host
    } else { & $Node $Npm install --prefix $candidateRoot --registry=https://registry.npmjs.org --save-exact --no-fund | Out-Host }
    if ($LASTEXITCODE -ne 0) { throw 'Claude installation failed; the previous managed executable was retained.' }
    $candidate = Join-Path $candidateRoot 'node_modules/@anthropic-ai/claude-code/bin/claude.exe'
    if (-not (Test-Path -LiteralPath $candidate)) { throw 'Claude native executable is missing; the previous copy was retained.' }
    $actual = Invoke-V4Claude $candidate @('--version')
    if ($script:V4ClaudeExitCode -ne 0 -or $actual -notlike "$Version *") { throw 'New Claude version verification failed; the previous copy was retained.' }
    $help = (Invoke-V4Claude $candidate @('--help')) -join "`n"
    if ($script:V4ClaudeExitCode -ne 0) { throw 'New Claude CLI did not provide its command help.' }
    foreach ($flag in @('--restricted','--tools','--allowedTools','--permission-prompts','--strict-mcp-config','--disable-slash-commands','--no-session-persistence','--output-format','--max-budget-usd')) {
        if (-not $help.Contains($flag)) { throw "New Claude CLI lacks required $flag; the previous copy was retained. Use -UseBundledAITools for the tested baseline." }
    }
    $agentRoot = Join-Path $script:V3Runtime 'claude'
    $runtimePrefix = [IO.Path]::GetFullPath($script:V3Runtime) + [IO.Path]::DirectorySeparatorChar
    foreach ($path in @($agentRoot,$candidateRoot)) {
        if (-not [IO.Path]::GetFullPath($path).StartsWith($runtimePrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Managed tool path escaped this installation.' }
    }
    if (Test-Path -LiteralPath $agentRoot) {
        $backupRoot = Join-Path $script:V3Runtime 'tool-backups'
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        $backup = [IO.Path]::GetFullPath((Join-Path $backupRoot ('claude-' + [guid]::NewGuid())))
        if (-not $backup.StartsWith($runtimePrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Managed tool backup escaped this installation.' }
        Move-Item -LiteralPath $agentRoot -Destination $backup
    }
    Move-Item -LiteralPath $candidateRoot -Destination $agentRoot
    return Get-V4Claude
}

function Connect-V4Claude([string]$Executable, [bool]$NonInteractive, [bool]$UseExistingLogin, [bool]$NoBrowser) {
    Write-Host 'Claude coding jobs require YOUR eligible Claude Pro/Max/Team/Enterprise or Claude Console account. A free Claude chat account alone is insufficient. Usage limits or billing can apply.'
    Write-Host 'V4 does not include the publisher account or keys. Enter passwords only on the provider sign-in page. Local Ollama/Qwen AI requires no account or API key.'
    $loggedIn = Get-V4ClaudeAuth $Executable
    if ($NonInteractive) {
        if ($loggedIn -and $UseExistingLogin) { Write-Host 'Using the destination Windows user Claude login explicitly authorized by -UseExistingClaudeLogin.'; return $true }
        throw 'Claude account confirmation is required. Run interactive Setup-V4.cmd, or use -UseExistingClaudeLogin with your own signed-in profile, or -SkipAgent.'
    }
    while ($true) {
        if ($loggedIn) { Write-Host 'A login exists in the current Windows user Claude profile. Confirm it is the account you intend to use.' }
        else { Write-Host 'No usable Claude profile login was found for the current Windows user.' }
        $choice = Read-Host 'Claude account: [1] use my existing login [2] sign in/change account [3] create an account, then sign in [4] skip coding jobs'
        if ($choice -eq '4') { return $false }
        if ($choice -eq '1') { if ($loggedIn -and (Get-V4ClaudeAuth $Executable)) { return $true }; Write-Host 'Sign in first, or skip coding jobs.'; $loggedIn=$false; continue }
        if ($choice -notin @('2','3')) { Write-Host 'Choose 1, 2, 3, or 4.'; continue }
        if ($choice -eq '3') {
            Write-Host 'Create your own account at https://claude.ai/ and arrange eligible Claude Code access, or use https://platform.claude.com/ for Console access. V4 does not create accounts or purchase plans.'
            if (-not $NoBrowser) { Start-Process 'https://claude.ai/' }
            $null = Read-Host 'Press Enter when your account is ready for Claude Code sign-in (or Ctrl+C to stop)'
        }
        Write-Host 'The following provider login can replace the current Claude profile login. Select your intended account in the provider browser.'
        Invoke-V4Claude $Executable @('auth','login') | Out-Host
        $loginExit = $script:V4ClaudeExitCode
        $loggedIn = Get-V4ClaudeAuth $Executable
        if ($loginExit -eq 0 -and $loggedIn) { Write-Host 'Claude profile sign-in completed. Live coding-job verification is available separately and consumes account usage.'; return $true }
        Write-Host 'Sign-in did not complete. Retry, finish your provider account setup, or choose 4 to keep finance/local AI working.'
    }
}
