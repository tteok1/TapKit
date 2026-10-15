param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$tapkitRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$tapkitApp = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'app-preparation.json') -Raw | ConvertFrom-Json
$tapkitAppDir = [System.IO.Path]::GetFullPath($tapkitApp.dataDir)
$tapkitTestRoot = [System.IO.Path]::GetFullPath((Join-Path $tapkitRoot '.test-data')) + [System.IO.Path]::DirectorySeparatorChar
if ($tapkitApp.root -ne $tapkitRoot -or -not $tapkitAppDir.StartsWith($tapkitTestRoot, [System.StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetFileName($tapkitAppDir) -notlike 'P01-02-app-zhipu-chat-*' -or -not (Test-Path -LiteralPath $tapkitAppDir -PathType Container)) {
  throw 'Unexpected isolated application directory. Application not started.'
}
if ((Get-Item -LiteralPath $tapkitAppDir).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
  throw 'Application profile must not be a link.'
}
if ($tapkitApp.config.providerId -ne 'openai-compatible' -or $tapkitApp.config.apiFormat -ne 'openai-chat' -or $tapkitApp.config.baseURL -ne 'https://open.bigmodel.cn/api/paas/v4' -or $tapkitApp.config.modelId -ne 'glm-4.7-flashx') {
  throw 'Unexpected application test configuration.'
}
$tapkitNode = Join-Path $tapkitRoot '.runtime/node/node-v24.21.0-win-x64/node.exe'
$tapkitNetworkRunner = Join-Path $tapkitRoot '.test-data/P01-02-live-network-preflight/index.cjs'
foreach ($tapkitRequired in @($tapkitNode, $tapkitNetworkRunner, (Join-Path $tapkitRoot '.cache/tools/pnpm/package/bin/pnpm.mjs'), (Join-Path $tapkitRoot 'node_modules/electron/dist/electron.exe'), (Join-Path $tapkitRoot 'node_modules/electron-vite/bin/electron-vite.js'))) {
  if (-not (Test-Path -LiteralPath $tapkitRequired -PathType Leaf)) { throw 'Local development dependency missing.' }
}
if ($CheckOnly) {
  [pscustomobject]@{status='prepared';dataDir=$tapkitAppDir;config=$tapkitApp.config;networkRequests=0;modelRequests=0;applicationStarted=$false} | ConvertTo-Json -Depth 8
  exit 0
}
& $tapkitNode $tapkitNetworkRunner $tapkitRoot --check-only
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Anonymous network preflight failed. Application not started.'
  exit 2
}
$tapkitOriginalDataDir = $env:TAPKIT_DATA_DIR
try {
  $env:TAPKIT_DATA_DIR = $tapkitAppDir
  Write-Host ('Isolated TapKit application profile: ' + $tapkitAppDir)
  Write-Host 'Enter and save the Key only in the application password field. Follow app-acceptance.md.'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tapkitRoot 'scripts/pnpm.ps1') dev
  $tapkitExitCode = $LASTEXITCODE
} finally {
  $env:TAPKIT_DATA_DIR = $tapkitOriginalDataDir
}
exit $tapkitExitCode
