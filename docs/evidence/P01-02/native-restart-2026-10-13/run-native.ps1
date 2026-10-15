param([switch]$PrepareOnly, [string]$Account = 'test1')
$ErrorActionPreference = 'Stop'
$tapkitNativeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$tapkitAppManifest = Get-Content -LiteralPath (Join-Path $tapkitNativeRoot 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json') -Raw | ConvertFrom-Json
if ($tapkitAppManifest.root -ne $tapkitNativeRoot) { throw 'Unexpected repository binding.' }
$tapkitPreviousDataDir = $env:TAPKIT_LIVE_DATA_DIR
$tapkitPreviousOptIn = $env:TAPKIT_API_NATIVE_LIVE
try {
  $env:TAPKIT_LIVE_DATA_DIR = $tapkitAppManifest.dataDir
  $tapkitNativeArgs = @('test:live', '--', '--provider', 'openai-compatible', '--account', $Account, '--native-restart')
  if ($PrepareOnly) { $tapkitNativeArgs += '--prepare-only' }
  else {
    $env:TAPKIT_API_NATIVE_LIVE = '1'
    Write-Host 'Close TapKit completely first. This acceptance makes at most two requests, with no retry or helper requests.'
    Write-Host 'The saved Key is read only by the local official Host. Do not send any Key or native data to Codex.'
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tapkitNativeRoot 'scripts/pnpm.ps1') @tapkitNativeArgs
  $tapkitNativeExit = $LASTEXITCODE
} finally {
  $env:TAPKIT_LIVE_DATA_DIR = $tapkitPreviousDataDir
  $env:TAPKIT_API_NATIVE_LIVE = $tapkitPreviousOptIn
}
exit $tapkitNativeExit
