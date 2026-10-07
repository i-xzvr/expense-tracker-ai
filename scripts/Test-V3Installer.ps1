# Harmless lifecycle checks using a local temporary HTTP server, never the user's app process.
[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
$node = Get-V3Node
$testRuntime = Join-Path $script:V3Runtime ('installer tests ' + [Guid]::NewGuid().ToString('N'))
$script:V3Runtime = $testRuntime
Initialize-V3Folders
$passed = 0
function Assert-Installer($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:passed++
    Write-Host "PASS: $Message"
}
try {
    $fixture = Join-Path $testRuntime 'test helper.js'
    'require("node:http").createServer((req,res)=>{res.setHeader("Content-Type","application/json");res.end("{\"ok\":true}")}).listen(Number(process.argv[2]),"127.0.0.1");' | Set-Content -LiteralPath $fixture -Encoding ASCII
    $hash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
    Assert-V3Hash $fixture $hash
    Assert-Installer $true 'Correct hash accepted, including paths with spaces.'
    $rejected = $false
    try { Assert-V3Hash $fixture ('0' * 64) } catch { $rejected = $true }
    Assert-Installer $rejected 'Hash mismatch rejected.'
    $modelDirectory = Join-Path $testRuntime 'models/manifests/test/library/fixture'
    $blobDirectory = Join-Path $testRuntime 'models/blobs'
    New-Item -ItemType Directory -Force -Path $modelDirectory, $blobDirectory | Out-Null
    $blobFixture = Join-Path $testRuntime 'config fixture.json'
    [IO.File]::WriteAllText($blobFixture, '{}')
    $blobHash = (Get-FileHash -LiteralPath $blobFixture -Algorithm SHA256).Hash.ToLowerInvariant()
    Copy-Item -LiteralPath $blobFixture -Destination (Join-Path $blobDirectory "sha256-$blobHash")
    $canonical = [ordered]@{
        schemaVersion = 2; mediaType = 'application/vnd.docker.distribution.manifest.v2+json'
        config = @{ mediaType = 'application/vnd.docker.container.image.v1+json'; digest = "sha256:$blobHash"; size = 2 }
        layers = @(@{ mediaType = 'application/vnd.ollama.image.template'; digest = "sha256:$blobHash"; size = 2 })
        runner = 'llamacpp'; format = 'gguf'
    }
    $manifestPath = Join-Path $modelDirectory 'tiny'
    [IO.File]::WriteAllText($manifestPath, ($canonical | ConvertTo-Json -Depth 12 -Compress))
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $script:V3Config.models = @([PSCustomObject]@{ name = 'fixture:tiny'; manifest = 'test/library/fixture/tiny'; sha256 = $manifestHash })
    Assert-V3ModelFiles 'fixture:tiny' -Full
    Assert-Installer $true 'Original model manifest and blob are verified.'
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $blobDirectory "sha256-$manifestHash")
    $canonical.layers += @{ mediaType = 'application/vnd.docker.distribution.manifest.v2+json'; digest = "sha256:$manifestHash"; size = (Get-Item -LiteralPath $manifestPath).Length }
    [IO.File]::WriteAllText($manifestPath, ($canonical | ConvertTo-Json -Depth 12 -Compress))
    Assert-V3ModelFiles 'fixture:tiny' -Full
    Assert-Installer $true 'Ollama provenance manifest preserves and verifies the exact canonical model.'
    $canonical.layers[0].digest = 'sha256:' + ('0' * 64)
    [IO.File]::WriteAllText($manifestPath, ($canonical | ConvertTo-Json -Depth 12 -Compress))
    $rejected = $false
    try { Assert-V3ModelFiles 'fixture:tiny' } catch { $rejected = $true }
    Assert-Installer $rejected 'Modified model layer is rejected even when its canonical manifest blob remains valid.'
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
    $first = Start-V3OwnedProcess 'fixture' $node @($fixture, "$port") @{} $port
    $health = Wait-V3Http "http://127.0.0.1:$port"
    Assert-Installer $health.ok 'Hidden process starts and serves on loopback from a path with spaces.'
    Assert-Installer (Test-V3ProcessIdentity $first) 'Identity matches executable, command line, and creation time.'
    $second = Start-V3OwnedProcess 'fixture' $node @($fixture, "$port") @{} $port
    Assert-Installer ($first.pid -eq $second.pid) 'Second start reuses the same owned process.'
    $rejected = $false
    try { $null = Start-V3OwnedProcess 'unrelated' $node @($fixture, "$port") @{} $port } catch { $rejected = $true }
    Assert-Installer $rejected 'An occupied unowned port is rejected.'
    $recordPath = Join-Path $testRuntime 'state/fixture.json'
    $altered = $first | ConvertTo-Json | ConvertFrom-Json
    $altered.commandLine = 'intentionally different command line'
    $altered | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
    Stop-V3OwnedProcess 'fixture'
    Assert-Installer (Test-V3ProcessIdentity $first) 'Mismatching process identity is not terminated.'
    $first | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
    Stop-V3OwnedProcess 'fixture'
    Assert-Installer (-not (Test-V3ProcessIdentity $first)) 'Matching process stops.'
    Stop-V3OwnedProcess 'fixture'
    Assert-Installer $true 'Repeated stop is safe.'
    Write-Host "$passed installer checks passed. Test evidence remains under $testRuntime."
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
finally {
    if ($null -ne (Get-V3ProcessRecord 'fixture')) { Stop-V3OwnedProcess 'fixture' }
}
