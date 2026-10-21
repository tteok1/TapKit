$ErrorActionPreference = 'Stop'
$seed = Split-Path -Parent $MyInvocation.MyCommand.Path
$lock = Get-Content -LiteralPath (Join-Path $seed 'runtime-lock.json') -Raw | ConvertFrom-Json
$node = Join-Path (Join-Path (Join-Path $seed '.runtime/node') $lock.runtimes.node.directory) $lock.runtimes.node.executable
$entry = Join-Path $seed 'scripts/local-standard-user-attachment.mjs'
if (!(Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Locked Node runtime is missing.' }
if (!(Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Verification entrypoint is missing.' }
& $node $entry
$result = $LASTEXITCODE
Write-Host ('Verification exit code: ' + $result)
exit $result
