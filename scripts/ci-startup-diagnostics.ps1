$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$taskNode = Join-Path $PSScriptRoot '../.runtime/node/node-v24.21.0-win-x64/node.exe'
$taskPnpm = Join-Path $PSScriptRoot '../.cache/tools/pnpm/package/bin/pnpm.mjs'
$taskFailures = 0
for ($taskIteration = 1; $taskIteration -le 3; $taskIteration++) {
  Write-Output "STARTUP_DIAGNOSTIC_REPEAT $taskIteration storage"
  & $taskNode $taskPnpm test:integration tests/integration/P00-02.storage.test.ts --testNamePattern 'creates one profile'
  if ($LASTEXITCODE -ne 0) { $taskFailures++ }
  Write-Output "STARTUP_DIAGNOSTIC_REPEAT $taskIteration vault"
  & $taskNode $taskPnpm test:e2e -- --grep 'P00-02 T19 real Windows safeStorage round trip' --output "test-results/e2e-startup-repeat-$taskIteration"
  if ($LASTEXITCODE -ne 0) { $taskFailures++ }
}
if ($taskFailures -ne 0) { throw "Startup diagnostic checks failed: $taskFailures" }
