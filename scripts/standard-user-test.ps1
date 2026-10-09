param([string]$Destination)
$ErrorActionPreference = 'Stop'
$tapkitRoot = Split-Path -Parent $PSScriptRoot
$tapkitNode = Join-Path $tapkitRoot '.runtime/node/node-v24.21.0-win-x64/node.exe'
$tapkitArgs = @((Join-Path $PSScriptRoot 'standard-user-test.mjs'))
if ($Destination) { $tapkitArgs += $Destination }
& $tapkitNode @tapkitArgs
exit $LASTEXITCODE
