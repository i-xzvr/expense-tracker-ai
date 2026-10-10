[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
try {
  $tokenPath = Join-Path $script:V3Runtime 'v4-services-token'
  if (Test-Path -LiteralPath $tokenPath) {
    try {
      $headers = @{ Authorization = 'Bearer ' + [IO.File]::ReadAllText($tokenPath).Trim() }
      $null = Invoke-RestMethod -Uri 'http://127.0.0.1:3105/shutdown' -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 5
      Start-Sleep -Seconds 4
    } catch { Write-Host 'V4 services were already unavailable; checking owned process records.' }
  }
  Stop-V3OwnedProcess 'v4-services'; Stop-V3OwnedProcess 'app'; Stop-V3OwnedProcess 'ollama'; exit 0
}
catch { Write-Error $_ -ErrorAction Continue; exit 1 }
