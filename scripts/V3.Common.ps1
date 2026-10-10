# Compatible with Windows PowerShell 5.1 and PowerShell 7.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:V3Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:V3Runtime = Join-Path $script:V3Root '.runtime'
$script:V3Config = Get-Content -LiteralPath (Join-Path $script:V3Root 'config/local-ai.json') -Raw | ConvertFrom-Json

# Get-FileHash is a module-exported function that may not be discoverable when
# Windows PowerShell inherits another shell's module paths. Hash through .NET
# directly so double-click launchers keep checksum verification self-contained.
function Get-V3FileHash {
    param([Parameter(Mandatory=$true)][string]$LiteralPath, [ValidateSet('SHA256')][string]$Algorithm = 'SHA256')
    $stream = [IO.File]::OpenRead($LiteralPath)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $digest = $hasher.ComputeHash($stream)
        return [PSCustomObject]@{ Hash = [BitConverter]::ToString($digest).Replace('-', '') }
    } finally { $hasher.Dispose(); $stream.Dispose() }
}

function Initialize-V3Folders {
    foreach ($directory in @('downloads', 'logs', 'state', 'models', 'ollama-profile', 'tmp')) {
        New-Item -ItemType Directory -Force -Path (Join-Path $script:V3Runtime $directory) | Out-Null
    }
}

function Assert-V3Windows {
    if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
        throw 'These launchers require 64-bit Windows 10 22H2 or newer. See docs/v3-installation.md.'
    }
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
        throw 'This package pins Windows x64 binaries; Windows ARM64 is not supported by this installer.'
    }
    if ($PSVersionTable.PSVersion -lt [version]'5.1' -or [Environment]::OSVersion.Version.Build -lt 19045) {
        throw 'Setup requires PowerShell 5.1+ and Windows 10 22H2 (build 19045) or newer.'
    }
}

function Assert-V3Hash([string]$Path, [string]$Expected) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required file is missing: $Path" }
    $actual = (Get-V3FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) { throw "SHA256 mismatch: $Path. Expected $Expected; got $actual. The file was not trusted or executed." }
}

function Get-V3VerifiedDownload([string]$Url, [string]$Destination, [string]$Sha256) {
    if (Test-Path -LiteralPath $Destination) {
        Assert-V3Hash $Destination $Sha256
        Write-Host "Using verified cached archive: $([IO.Path]::GetFileName($Destination))"
        return
    }
    $partial = "$Destination.partial"
    Write-Host "Downloading $Url (first setup can take several minutes)..."
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & $curl.Source --fail --location --retry 3 --continue-at - --output $partial $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed with curl exit $LASTEXITCODE. Rerun setup to resume." }
    } else {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $partial
    }
    Assert-V3Hash $partial $Sha256
    Move-Item -LiteralPath $partial -Destination $Destination
}

function Expand-V3Archive([string]$Archive, [string]$Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Write-Host "Extracting $([IO.Path]::GetFileName($Archive))..."
    Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
}

function Get-V3Node {
    $node = Join-Path (Join-Path $script:V3Runtime $script:V3Config.node.directory) 'node.exe'
    if (-not (Test-Path -LiteralPath $node)) { throw 'Portable Node is missing. Run Setup-V3.cmd first.' }
    $version = & $node --version
    if ($LASTEXITCODE -ne 0 -or $version -ne "v$($script:V3Config.node.version)") { throw 'Portable Node version does not match the pinned configuration. Rerun setup.' }
    return $node
}

function Get-V3Ollama {
    $binary = Join-Path (Join-Path $script:V3Runtime $script:V3Config.ollama.directory) 'ollama.exe'
    if (-not (Test-Path -LiteralPath $binary)) { throw 'Portable Ollama is missing. Run Setup-V3.cmd or use Start-V3.cmd -NoAI.' }
    return $binary
}

function Get-V3Model([string]$Name) {
    $model = @($script:V3Config.models | Where-Object { $_.name -eq $Name })
    if ($model.Count -ne 1) { throw "Unsupported model: $Name. Choose qwen3.5:4b or qwen3.5:2b." }
    return $model[0]
}

function Get-V3Settings {
    $path = Join-Path $script:V3Runtime 'settings.json'
    if (Test-Path -LiteralPath $path) { return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json) }
    return [PSCustomObject]@{ model = $script:V3Config.defaultModel; noAI = $false }
}

function Save-V3Settings([string]$Model, [bool]$NoAI) {
    [PSCustomObject]@{ model = $Model; noAI = $NoAI; savedAt = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:V3Runtime 'settings.json') -Encoding UTF8
}

function Get-V3OllamaEnvironment {
    # USERPROFILE is overridden only in the child process launch and restored immediately.
    # Ollama generates a local key pair there even with cloud disabled; keep it in this project.
    return @{
        OLLAMA_HOST = '127.0.0.1:11435'
        OLLAMA_MODELS = (Join-Path $script:V3Runtime 'models')
        OLLAMA_NO_CLOUD = '1'
        OLLAMA_NOHISTORY = '1'
        OLLAMA_CONTEXT_LENGTH = '4096'
        OLLAMA_NUM_PARALLEL = '1'
        OLLAMA_MAX_LOADED_MODELS = '1'
        OLLAMA_MAX_QUEUE = '4'
        OLLAMA_KEEP_ALIVE = '5m'
        USERPROFILE = (Join-Path $script:V3Runtime 'ollama-profile')
        TEMP = (Join-Path $script:V3Runtime 'tmp')
        TMP = (Join-Path $script:V3Runtime 'tmp')
    }
}

function Get-V3ProcessRecord([string]$Name) {
    $path = Join-Path $script:V3Runtime "state/$Name.json"
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
}

function Test-V3ProcessIdentity($Record) {
    if ($null -eq $Record) { return $false }
    if ("$($Record.pid)" -notmatch '^[1-9][0-9]*$' -or $Record.executable -isnot [string] -or
        -not $Record.executable.StartsWith($script:V3Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Record.pid)" -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $false }
    return $process.ExecutablePath -eq $Record.executable -and
        $process.CommandLine -eq $Record.commandLine -and
        $process.CreationDate.ToUniversalTime().Ticks -eq ([DateTime]$Record.createdAt).ToUniversalTime().Ticks
}

function Test-V3Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $pending.Wait(700)) { return $false }
        return $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

function Start-V3OwnedProcess([string]$Name, [string]$Executable, [string[]]$Arguments, [hashtable]$EnvironmentVariables, [int]$Port) {
    if (-not ([IO.Path]::GetFullPath($Executable)).StartsWith($script:V3Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'V3 starts only the portable executables inside its own project folder.'
    }
    $record = Get-V3ProcessRecord $Name
    if (Test-V3ProcessIdentity $record) {
        Write-Host "$Name is already running (PID $($record.pid))."
        return $record
    }
    if (Test-V3Port $Port) { throw "Port $Port is in use by another process. It will not be stopped or reused. Close that process or the other V3 copy first." }
    $saved = @{}
    foreach ($key in $EnvironmentVariables.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $EnvironmentVariables[$key], 'Process')
    }
    try {
        $quoted = ($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
        $process = Start-Process -FilePath $Executable -ArgumentList $quoted -WorkingDirectory $script:V3Root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:V3Runtime "logs/$Name.stdout.log") -RedirectStandardError (Join-Path $script:V3Runtime "logs/$Name.stderr.log")
    } finally {
        foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
    }
    Start-Sleep -Milliseconds 250
    $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction SilentlyContinue
    if ($null -eq $identity) { throw "$Name exited during startup. See .runtime/logs/$Name.stderr.log." }
    $record = [PSCustomObject]@{ pid = $process.Id; executable = $identity.ExecutablePath; commandLine = $identity.CommandLine; createdAt = $identity.CreationDate.ToUniversalTime().ToString('o') }
    $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:V3Runtime "state/$Name.json") -Encoding UTF8
    return $record
}

function Wait-V3Http([string]$Uri, [int]$Seconds = 45) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        try { return (Invoke-RestMethod -Uri $Uri -TimeoutSec 2) } catch { Start-Sleep -Milliseconds 500 }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Timed out waiting for $Uri. Check .runtime/logs."
}

function Start-V3Ollama {
    $binary = Get-V3Ollama
    $record = Start-V3OwnedProcess 'ollama' $binary @('serve') (Get-V3OllamaEnvironment) 11435
    $health = Wait-V3Http "$($script:V3Config.ollama.baseUrl)/api/version"
    if ($health.version -ne $script:V3Config.ollama.version) { throw 'The running Ollama version does not match the pinned version.' }
    return $record
}

function Assert-V3ModelFiles([string]$Name, [switch]$Full) {
    $model = Get-V3Model $Name
    $manifest = Join-Path (Join-Path $script:V3Runtime 'models/manifests') $model.manifest
    if (-not (Test-Path -LiteralPath $manifest)) { throw "Model $Name is missing. Run Setup-V3.cmd." }
    $contents = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $storedHash = (Get-V3FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($storedHash -ne $model.sha256) {
        # Ollama 0.40 stores provenance layers in the local manifest. Its public model
        # digest is the original canonical manifest, retained as a verified blob.
        $canonicalPath = Join-Path $script:V3Runtime "models/blobs/sha256-$($model.sha256)"
        Assert-V3Hash $canonicalPath $model.sha256
        $canonical = Get-Content -LiteralPath $canonicalPath -Raw | ConvertFrom-Json
        $provenanceTypes = @('application/vnd.ollama.manifest.list.v2+json', 'application/vnd.docker.distribution.manifest.v2+json')
        $canonicalLinks = @($contents.layers | Where-Object { $_.mediaType -eq $provenanceTypes[1] -and $_.digest -eq "sha256:$($model.sha256)" })
        if ($canonicalLinks.Count -ne 1) { throw "Model $Name does not reference its pinned canonical manifest." }
        $normalized = [ordered]@{
            schemaVersion = $contents.schemaVersion
            mediaType = $contents.mediaType
            config = $contents.config
            layers = @($contents.layers | Where-Object { $_.mediaType -notin $provenanceTypes })
            runner = $contents.runner
            format = $contents.format
        }
        if (($normalized | ConvertTo-Json -Depth 12 -Compress) -ne ($canonical | ConvertTo-Json -Depth 12 -Compress)) {
            throw "Model $Name differs from the pinned canonical model. Do not bypass this check."
        }
    }
    if ($Full) {
        foreach ($layer in (@($contents.config) + @($contents.layers))) {
            if ($layer.digest -notmatch '^sha256:([0-9a-f]{64})$') { throw 'Invalid model layer digest.' }
            $hash = $Matches[1]
            Assert-V3Hash (Join-Path $script:V3Runtime "models/blobs/sha256-$hash") $hash
        }
    }
}

function Stop-V3OwnedProcess([string]$Name) {
    $record = Get-V3ProcessRecord $Name
    if ($null -eq $record) { Write-Host "$Name has no recorded process."; return }
    if (Test-V3ProcessIdentity $record) {
        $all = @(Get-CimInstance Win32_Process)
        $parents = @([int]$record.pid)
        $children = @()
        do {
            $next = @($all | Where-Object { $parents -contains [int]$_.ParentProcessId -and $_.CreationDate.ToUniversalTime() -ge [DateTime]$record.createdAt })
            $children += $next
            $parents = @($next | ForEach-Object { [int]$_.ProcessId })
        } while ($parents.Count -gt 0)
        # Kill only descendants whose executable is inside this checkout, then the identified parent.
        [array]::Reverse($children)
        foreach ($child in $children) {
            if ($child.ExecutablePath -and $child.ExecutablePath.StartsWith($script:V3Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($child.ProcessId)" -ErrorAction SilentlyContinue
                if ($current -and $current.CreationDate -eq $child.CreationDate -and $current.ExecutablePath -eq $child.ExecutablePath) {
                    Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
                }
            }
        }
        if (Test-V3ProcessIdentity $record) { Stop-Process -Id $record.pid -ErrorAction Stop }
        Write-Host "Stopped $Name (PID $($record.pid))."
    } else { Write-Host "$Name is already stopped or its PID was reused; no process was terminated." }
    Remove-Item -LiteralPath (Join-Path $script:V3Runtime "state/$Name.json")
}
