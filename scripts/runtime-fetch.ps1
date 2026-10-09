$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'pnpm.ps1') runtime:fetch
if ($LASTEXITCODE -ne 0) { throw "Runtime preparation failed: $LASTEXITCODE" }
