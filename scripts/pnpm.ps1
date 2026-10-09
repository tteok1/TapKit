$ErrorActionPreference = 'Stop'
$tapkitRoot = Split-Path -Parent $PSScriptRoot
$tapkitLock = Get-Content -LiteralPath (Join-Path $tapkitRoot 'runtime-lock.json') -Raw | ConvertFrom-Json
$tapkitNode = Join-Path $tapkitRoot ('.runtime/node/' + $tapkitLock.runtimes.node.directory + '/node.exe')
$tapkitPnpm = Join-Path $tapkitRoot '.cache/tools/pnpm/package/bin/pnpm.mjs'
if (-not (Test-Path -LiteralPath $tapkitNode) -or -not (Test-Path -LiteralPath $tapkitPnpm)) { throw 'Run scripts/bootstrap.ps1 first.' }
Push-Location -LiteralPath $tapkitRoot
$tapkitOriginalPath = $env:Path
try {
  $env:Path = (Split-Path -Parent $tapkitNode) + [System.IO.Path]::PathSeparator + $env:Path
  & $tapkitNode $tapkitPnpm @args
  if ($LASTEXITCODE -ne 0) {
    $tapkitCommandExit = $LASTEXITCODE
    if ($args[0] -eq 'test:live' -and $args -contains '--account') {
      Write-Host 'API live did not pass. See the JSON report; no automatic retry.'
      exit $tapkitCommandExit
    }
    throw "pnpm exited $tapkitCommandExit"
  }
} finally { $env:Path = $tapkitOriginalPath; Pop-Location }
