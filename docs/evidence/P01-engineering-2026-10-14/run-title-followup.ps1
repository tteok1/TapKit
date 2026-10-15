param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$tapkitTitleRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$tapkitTitleManifest = Get-Content -LiteralPath (Join-Path $tapkitTitleRoot 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json') -Raw | ConvertFrom-Json
$tapkitTitleProfile = [System.IO.Path]::GetFullPath($tapkitTitleManifest.dataDir)
$tapkitTitleExpectedParent = Join-Path $tapkitTitleRoot '.test-data'
if ($tapkitTitleManifest.root -ne $tapkitTitleRoot -or [System.IO.Path]::GetDirectoryName($tapkitTitleProfile) -ne $tapkitTitleExpectedParent -or [System.IO.Path]::GetFileName($tapkitTitleProfile) -notlike 'P01-02-app-zhipu-chat-*' -or -not (Test-Path -LiteralPath $tapkitTitleProfile -PathType Container)) { throw 'Unexpected isolated profile binding.' }
if ((Get-Item -LiteralPath $tapkitTitleProfile).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Profile links are not supported.' }
$tapkitTitleNode = Join-Path $tapkitTitleRoot '.runtime/node/node-v24.21.0-win-x64/node.exe'
& $tapkitTitleNode (Join-Path $PSScriptRoot 'review-title-public-state.mjs') prepare
if ($LASTEXITCODE -ne 0) { throw 'Public title preflight did not pass. No application started.' }
if ($CheckOnly) {
  [pscustomobject]@{status='prepared';applicationStarted=$false;modelRequests=0;credentialReads=0;nativeContentReads=0;dataDir=$tapkitTitleProfile} | ConvertTo-Json -Compress
  exit 0
}
$tapkitTitlePreviousData = $env:TAPKIT_DATA_DIR
$tapkitTitlePreviousFixture = $env:TAPKIT_CHAT_FIXTURE
$tapkitTitlePreviousBuild = $env:TAPKIT_TEST_BUILD
try {
  $env:TAPKIT_DATA_DIR = $tapkitTitleProfile
  $env:TAPKIT_CHAT_FIXTURE = $null
  $env:TAPKIT_TEST_BUILD = $null
  Write-Host 'Close TapKit completely first. Open the prior OK chat whose automatic title failed.'
  Write-Host 'Click AI rename once only: at most one title request, 128 maximum output tokens, no automatic retry.'
  Write-Host 'The saved Key remains in the local Host. Do not re-enter or share it.'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tapkitTitleRoot 'scripts/pnpm.ps1') dev
  $tapkitTitleExit = $LASTEXITCODE
} finally {
  $env:TAPKIT_DATA_DIR = $tapkitTitlePreviousData
  $env:TAPKIT_CHAT_FIXTURE = $tapkitTitlePreviousFixture
  $env:TAPKIT_TEST_BUILD = $tapkitTitlePreviousBuild
}
exit $tapkitTitleExit
