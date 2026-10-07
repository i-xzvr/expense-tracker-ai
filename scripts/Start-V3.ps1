[CmdletBinding()]
param([switch]$NoAI, [switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
try {
    Assert-V3Windows
    Initialize-V3Folders
    try {
        $setupCheck = [IO.File]::Open((Join-Path $script:V3Runtime 'setup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        $setupCheck.Dispose()
    } catch { throw 'V3 setup is currently running. Wait for it to finish before starting the app.' }
    $settings = Get-V3Settings
    $disableAI = [bool]$NoAI -or [bool]$settings.noAI
    $node = Get-V3Node
    if (-not (Test-Path -LiteralPath (Join-Path $script:V3Root '.next/BUILD_ID'))) { throw 'A production build is missing. Run Setup-V3.cmd first.' }
    if (-not $disableAI) {
        Assert-V3ModelFiles $settings.model
        $null = Start-V3Ollama
    }
    $appEnvironment = @{
        OLLAMA_BASE_URL = $script:V3Config.ollama.baseUrl
        OLLAMA_MODEL = $settings.model
        LOCAL_AI_DISABLED = $(if ($disableAI) { '1' } else { '0' })
        NEXT_TELEMETRY_DISABLED = '1'
        NODE_ENV = 'production'
        V3_CHAT_DATABASE_PATH = (Join-Path $script:V3Root 'data/chats.sqlite')
    }
    $next = Join-Path $script:V3Root 'node_modules/next/dist/bin/next'
    $existing = Get-V3ProcessRecord 'app'
    if ((Test-V3ProcessIdentity $existing) -and $NoAI) { throw 'The app is already running. Run Stop-V3.cmd before changing AI mode.' }
    $null = Start-V3OwnedProcess 'app' $node @($next, 'start', '--hostname', '127.0.0.1', '--port', '3103') $appEnvironment 3103
    $null = Wait-V3Http $script:V3Config.appUrl
    Write-Host "V3 is running at $($script:V3Config.appUrl). Logs: .runtime/logs. Stop-V3.cmd stops this copy."
    if (-not $NoBrowser) { Start-Process $script:V3Config.appUrl }
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
