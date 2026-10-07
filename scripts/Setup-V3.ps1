[CmdletBinding()]
param(
    [ValidateSet('qwen3.5:4b', 'qwen3.5:2b')][string]$Model = 'qwen3.5:4b',
    [switch]$NoAI,
    [switch]$RuntimeOnly
)
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
$setupLock = $null
try {
    Assert-V3Windows
    Initialize-V3Folders
    try { $setupLock = [IO.File]::Open((Join-Path $script:V3Runtime 'setup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw 'Another V3 setup is running. Wait for it to finish before starting setup again.' }
    if (Test-V3ProcessIdentity (Get-V3ProcessRecord 'app')) { throw 'V3 is running. Run Stop-V3.cmd before setup so its build and dependencies are not changed while in use.' }
    $nodeArchive = Join-Path $script:V3Runtime "downloads/node-v$($script:V3Config.node.version)-win-x64.zip"
    Get-V3VerifiedDownload $script:V3Config.node.url $nodeArchive $script:V3Config.node.sha256
    $nodeDirectory = Join-Path $script:V3Runtime $script:V3Config.node.directory
    $nodePath = Join-Path $nodeDirectory 'node.exe'
    $nodeMarker = Join-Path $nodeDirectory '.archive-sha256'
    if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $nodeMarker)) {
        Expand-V3Archive $nodeArchive $script:V3Runtime
        $script:V3Config.node.sha256 | Set-Content -LiteralPath $nodeMarker -Encoding ASCII
    }
    $node = Get-V3Node
    Write-Host "Portable Node $($script:V3Config.node.version) is ready."

    if (-not $NoAI) {
        $archive = Join-Path $script:V3Runtime "downloads/ollama-windows-amd64-$($script:V3Config.ollama.version).zip"
        Get-V3VerifiedDownload $script:V3Config.ollama.url $archive $script:V3Config.ollama.sha256
        $ollamaDirectory = Join-Path $script:V3Runtime $script:V3Config.ollama.directory
        $ollamaMarker = Join-Path $ollamaDirectory '.archive-sha256'
        if (-not (Test-Path -LiteralPath (Join-Path $ollamaDirectory 'ollama.exe')) -or -not (Test-Path -LiteralPath $ollamaMarker)) {
            if (Test-V3ProcessIdentity (Get-V3ProcessRecord 'ollama')) { throw 'Ollama needs a complete extraction. Run Stop-V3.cmd, then rerun setup.' }
            Expand-V3Archive $archive $ollamaDirectory
            $script:V3Config.ollama.sha256 | Set-Content -LiteralPath $ollamaMarker -Encoding ASCII
        }
        $null = Start-V3Ollama
        $definition = Get-V3Model $Model
        $manifest = Join-Path (Join-Path $script:V3Runtime 'models/manifests') $definition.manifest
        if (-not (Test-Path -LiteralPath $manifest)) {
            $parts = $Model -split ':'
            $registryManifest = Join-Path $script:V3Runtime "downloads/$($parts[0])-$($parts[1]).manifest.json"
            Get-V3VerifiedDownload "https://registry.ollama.ai/v2/library/$($parts[0])/manifests/$($parts[1])" $registryManifest $definition.sha256
            Write-Host "Downloading $Model (about 3.3 GB for 4b or 2.7 GB for 2b). Downloads resume on rerun."
            $previousHost = [Environment]::GetEnvironmentVariable('OLLAMA_HOST', 'Process')
            $previousCloud = [Environment]::GetEnvironmentVariable('OLLAMA_NO_CLOUD', 'Process')
            try {
                $env:OLLAMA_HOST = $script:V3Config.ollama.baseUrl
                $env:OLLAMA_NO_CLOUD = '1'
                & (Get-V3Ollama) pull $Model
                if ($LASTEXITCODE -ne 0) { throw "Model download failed (exit $LASTEXITCODE). Rerun setup to resume." }
            } finally {
                [Environment]::SetEnvironmentVariable('OLLAMA_HOST', $previousHost, 'Process')
                [Environment]::SetEnvironmentVariable('OLLAMA_NO_CLOUD', $previousCloud, 'Process')
            }
        }
        Write-Host 'Verifying the pinned model manifest and every model blob...'
        Assert-V3ModelFiles $Model -Full
        Write-Host 'Running a local structured-response smoke test (CPU-only machines can take several minutes)...'
        $body = @{
            model = $Model; stream = $false; think = $false; keep_alive = '5m'
            messages = @(@{ role = 'user'; content = 'Return exactly {"status":"ready"}. No other text.' })
            format = @{ type = 'object'; properties = @{ status = @{ type = 'string'; enum = @('ready') } }; required = @('status'); additionalProperties = $false }
            options = @{ temperature = 0; num_ctx = 4096; num_predict = 32 }
        } | ConvertTo-Json -Depth 10
        $timer = [Diagnostics.Stopwatch]::StartNew()
        $answer = Invoke-RestMethod -Method Post -Uri "$($script:V3Config.ollama.baseUrl)/api/chat" -Body $body -ContentType 'application/json' -TimeoutSec 600
        $decoded = $answer.message.content | ConvertFrom-Json
        if ($decoded.status -ne 'ready') { throw 'Local model smoke test did not return the required structured answer.' }
        $timer.Stop()
        [PSCustomObject]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); model = $Model; digest = $definition.sha256; ollama = $script:V3Config.ollama.version; response = $decoded; elapsedSeconds = [Math]::Round($timer.Elapsed.TotalSeconds, 2) } |
            ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $script:V3Runtime 'state/model-verification.json') -Encoding UTF8
        Write-Host "Local AI returned the verified response in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds."
    } else { Write-Host 'AI installation skipped. Reports, manual receipts, imports, and backups remain available without AI.' }

    if (-not $RuntimeOnly) {
        Write-Host 'Installing the exact application lockfile and checking lint, types, tests, production build, and audit...'
        $priorPath = $env:PATH
        $priorTelemetry = [Environment]::GetEnvironmentVariable('NEXT_TELEMETRY_DISABLED', 'Process')
        try {
            $env:PATH = [IO.Path]::GetDirectoryName($node) + ';' + $priorPath
            $env:NEXT_TELEMETRY_DISABLED = '1'
            Push-Location $script:V3Root
            try {
                $npm = Join-Path ([IO.Path]::GetDirectoryName($node)) 'node_modules/npm/bin/npm-cli.js'
                & $node $npm ci --no-fund
                if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)." }
                & $node $npm run check
                if ($LASTEXITCODE -ne 0) { throw "Application verification failed (exit $LASTEXITCODE). Setup is incomplete." }
            } finally { Pop-Location }
        } finally {
            $env:PATH = $priorPath
            [Environment]::SetEnvironmentVariable('NEXT_TELEMETRY_DISABLED', $priorTelemetry, 'Process')
        }
    }
    Save-V3Settings $Model ([bool]$NoAI)
    if ($RuntimeOnly) { Write-Host 'Runtime setup complete. The application has not been installed or built by this run.' }
    else { Write-Host "V3 setup complete. Start-V3.cmd opens $($script:V3Config.appUrl)." }
    exit 0
} catch {
    Write-Error $_ -ErrorAction Continue
    Write-Host 'Setup did not finish. Correct the error and rerun; verified downloads are reused. Run Stop-V3.cmd to stop any runtime started during setup.'
    exit 1
} finally { if ($null -ne $setupLock) { $setupLock.Dispose() } }
