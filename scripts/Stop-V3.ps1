[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
try {
    Stop-V3OwnedProcess 'app'
    Stop-V3OwnedProcess 'ollama'
    exit 0
} catch { Write-Error $_ -ErrorAction Continue; exit 1 }
