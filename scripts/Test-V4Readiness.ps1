[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'V3.Common.ps1')
Assert-V3Windows
$node = Get-V3Node
$claude = & claude --version
if ($LASTEXITCODE -ne 0) { throw 'Claude must launch successfully before V4 agent jobs.' }
$authText = & claude auth status
$auth = $authText | ConvertFrom-Json
if (-not $auth.loggedIn) { throw 'Claude sign-in required: run claude auth login in your terminal.' }
$settings = Get-V3Settings
Assert-V3ModelFiles $settings.model
[PSCustomObject]@{ WindowsX64=$true; Node=(& $node --version); Claude=$claude; ClaudeLoggedIn=[bool]$auth.loggedIn; Git=(& git --version); GitBash=(Test-Path 'C:\Program Files\Git\bin\bash.exe'); LocalModel=$settings.model; ModelFilesVerified=$true }

