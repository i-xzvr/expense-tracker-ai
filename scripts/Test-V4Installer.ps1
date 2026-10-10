# Offline checks of portability and credential configuration; isolated private fixture.
. (Join-Path $PSScriptRoot 'V4.Common.ps1')
$fixture = Join-Path $script:V3Root ('work/v4 installer checks/' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $fixture | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $fixture 'config') | Out-Null
Copy-Item -LiteralPath (Join-Path $script:V3Root 'config/local-ai.json') -Destination (Join-Path $fixture 'config/local-ai.json')
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
    # Test real process environment sanitization without accessing a real account.
    $fake = Join-Path $fixture 'synthetic claude.cmd'
    [IO.File]::WriteAllText($fake,"@echo off`r`nif defined ANTHROPIC_API_KEY exit /b 9`r`nif defined CLAUDE_CODE_OAUTH_TOKEN exit /b 9`r`necho {`"loggedIn`":true}`r`nexit /b 0`r`n")
    $priorKey = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY','Process')
    $priorToken = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_OAUTH_TOKEN','Process')
    try {
        $env:ANTHROPIC_API_KEY='synthetic-not-a-key'; $env:CLAUDE_CODE_OAUTH_TOKEN='synthetic-not-a-token'
        Assert-V4Installer (Get-V4ClaudeAuth $fake) 'Claude login checks exclude inherited keys/tokens like the job worker.'
        Assert-V4Installer ($env:ANTHROPIC_API_KEY -eq 'synthetic-not-a-key' -and $env:CLAUDE_CODE_OAUTH_TOKEN -eq 'synthetic-not-a-token') 'Environment values are restored after the child invocation.'
    } finally {
        [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY',$priorKey,'Process')
        [Environment]::SetEnvironmentVariable('CLAUDE_CODE_OAUTH_TOKEN',$priorToken,'Process')
    }
    # Stub only provider commands/prompts; never sign out or alter the test host.
    $script:loggedIn=$true; $script:loginSucceeds=$true; $script:loginCount=0
    function Invoke-V4Claude([string]$Executable,[string[]]$Arguments) {
        $script:V4ClaudeExitCode=0
        if ($Arguments[1] -eq 'login') { $script:loginCount++; $script:loggedIn=$script:loginSucceeds; if (-not $script:loginSucceeds) { $script:V4ClaudeExitCode=1 }; return }
        return (@{loggedIn=$script:loggedIn} | ConvertTo-Json -Compress)
    }
    function Read-Host([string]$Prompt) { if ($script:answers.Count -eq 0) { throw 'Unexpected onboarding prompt.' }; return $script:answers.Dequeue() }
    function Set-Answers([string[]]$Values) { $script:answers=New-Object 'Collections.Generic.Queue[string]'; foreach ($value in $Values) { $script:answers.Enqueue($value) } }
    $rejected=$false
    try { $null=Connect-V4Claude $fake $true $false $true } catch { $rejected=$true }
    Assert-V4Installer $rejected 'Noninteractive setup cannot silently accept an existing account.'
    Assert-V4Installer (Connect-V4Claude $fake $true $true $true) 'Noninteractive use of an existing login requires explicit authorization.'
    $script:loggedIn=$false; $rejected=$false
    try { $null=Connect-V4Claude $fake $true $true $true } catch { $rejected=$true }
    Assert-V4Installer $rejected 'A new unsigned-in user is rejected even with the reuse-login flag.'
    Set-Answers @('1','2')
    Assert-V4Installer ((Connect-V4Claude $fake $false $false $true) -and $script:loginCount -eq 1) 'An unsigned-in user must complete provider login before coding jobs are enabled.'
    Set-Answers @('2')
    Assert-V4Installer ((Connect-V4Claude $fake $false $false $true) -and $script:loginCount -eq 2) 'An existing login can be replaced only through an explicit destination-user choice.'
    $script:loggedIn=$false; Set-Answers @('3','')
    Assert-V4Installer ((Connect-V4Claude $fake $false $false $true) -and $script:loginCount -eq 3) 'Account creation guidance is followed by verified provider sign-in.'
    $script:loggedIn=$false; $script:loginSucceeds=$false; Set-Answers @('2','4')
    Assert-V4Installer (-not (Connect-V4Claude $fake $false $false $true)) 'Failed sign-in can be skipped without falsely enabling coding jobs.'
    $script:metadataMode='good'
    function Invoke-RestMethod {
        param([string]$Uri,$Headers,$TimeoutSec)
        if ($Uri -like '*npmjs.org*') { return [PSCustomObject]@{version='2.1.999';dist=[PSCustomObject]@{integrity='sha512-synthetic'}} }
        $url='https://github.com/ollama/ollama/releases/download/v0.99.0/ollama-windows-amd64.zip'
        $digest='sha256:' + ('a' * 64)
        if ($script:metadataMode -eq 'badUrl') { $url='https://untrusted.example/tool.zip' }
        if ($script:metadataMode -eq 'badDigest') { $digest='sha256:invalid' }
        return [PSCustomObject]@{tag_name='v0.99.0';prerelease=$false;assets=@([PSCustomObject]@{name='ollama-windows-amd64.zip';browser_download_url=$url;digest=$digest})}
    }
    $plan=Get-V4AIToolPlan $true $true $false
    Assert-V4Installer ($plan.claudeVersion -eq '2.1.999' -and $plan.ollama.version -eq '0.99.0' -and $plan.channel -eq 'latest-stable') 'Enabled AI tools resolve newer stable releases from official metadata.'
    foreach ($mode in @('badUrl','badDigest')) {
        $script:metadataMode=$mode; $rejected=$false
        try { $null=Get-V4AIToolPlan $true $false $false } catch { $rejected=$true }
        Assert-V4Installer $rejected "Untrusted Ollama metadata is rejected: $mode."
    }
    $plan=Get-V4AIToolPlan $true $true $true
    Assert-V4Installer ($plan.channel -eq 'bundled' -and $plan.claudeVersion -eq $script:V4Tools.claudeVersion) 'Explicit bundled mode retains the supported source baseline without claiming latest status.'
    Write-Host "$count V4 installer checks passed. Synthetic evidence remains under ignored work/."
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
