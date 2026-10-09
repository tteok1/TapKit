$ErrorActionPreference = 'Stop'
$tapkitRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $tapkitRoot
try { & node (Join-Path $PSScriptRoot 'bootstrap.mjs'); if ($LASTEXITCODE -ne 0) { throw "bootstrap exited $LASTEXITCODE" } }
finally { Pop-Location }
