param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$tapkitRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$tapkitPreparation = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'preparation.json') -Raw | ConvertFrom-Json
if ($tapkitPreparation.root -ne $tapkitRoot -or $tapkitPreparation.config.providerId -ne 'openai-compatible' -or $tapkitPreparation.config.apiFormat -ne 'openai-chat' -or $tapkitPreparation.config.baseURL -ne 'https://open.bigmodel.cn/api/paas/v4' -or $tapkitPreparation.config.modelId -ne 'glm-4.7-flashx') {
  throw 'Unexpected preparation binding. No Key requested.'
}
$tapkitOriginalLiveDir = $env:TAPKIT_LIVE_DATA_DIR
$tapkitOriginalApiLive = $env:TAPKIT_API_LIVE
try {
  $env:TAPKIT_LIVE_DATA_DIR = $tapkitPreparation.dataDir
  $tapkitArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $tapkitRoot 'scripts/pnpm.ps1'), 'test:live', '--', '--provider', 'openai-compatible', '--account', $tapkitPreparation.accountId)
  if ($PrepareOnly) {
    $tapkitArguments += '--prepare-only'
  } else {
    $tapkitNetworkRunner = Join-Path $tapkitRoot '.test-data/P01-02-live-network-preflight/index.cjs'
    if (-not (Test-Path -LiteralPath $tapkitNetworkRunner)) { throw 'Network preflight runner is missing. No Key requested.' }
    $tapkitNode = Join-Path $tapkitRoot '.runtime/node/node-v24.21.0-win-x64/node.exe'
    & $tapkitNode $tapkitNetworkRunner $tapkitRoot --check-only
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'Network preflight did not pass. No Key requested and no model request sent.'
      exit 2
    }
    Write-Host 'Zhipu standard Chat / glm-4.7-flashx; reasoning off; up to 6 requests, 128 output tokens each, no retry.'
    Write-Host 'Enter the Key only in the hidden local prompt. The runner prints the safe report path.'
    $env:TAPKIT_API_LIVE = '1'
  }
  & powershell.exe @tapkitArguments
  $tapkitResult = $LASTEXITCODE
} finally {
  $env:TAPKIT_LIVE_DATA_DIR = $tapkitOriginalLiveDir
  $env:TAPKIT_API_LIVE = $tapkitOriginalApiLive
}
exit $tapkitResult
