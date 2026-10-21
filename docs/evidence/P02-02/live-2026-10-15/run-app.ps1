param([switch]$CheckOnly, [switch]$RefreshUiBuild)
$ErrorActionPreference = 'Stop'
$p02Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$p02Manifest = Get-Content -LiteralPath (Join-Path $p02Root 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json') -Raw | ConvertFrom-Json
$p02Profile = [System.IO.Path]::GetFullPath($p02Manifest.dataDir)
if ($p02Manifest.root -ne $p02Root -or [System.IO.Path]::GetDirectoryName($p02Profile) -ne (Join-Path $p02Root '.test-data') -or [System.IO.Path]::GetFileName($p02Profile) -notlike 'P01-02-app-zhipu-chat-*') { throw 'Unexpected isolated profile.' }
if ((Get-Item -LiteralPath $p02Profile).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Profile links are not supported.' }
$p02Node = Join-Path $p02Root '.runtime/node/node-v24.21.0-win-x64/node.exe'
if ($RefreshUiBuild) {
  $p02Executable = [System.IO.Path]::GetFullPath((Join-Path $p02Root 'node_modules/electron/dist/electron.exe'))
  $p02Running = Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $p02Executable }
  if ($p02Running) { throw 'Exit TapKit from the tray before using -RefreshUiBuild.' }
  & $p02Node (Join-Path $PSScriptRoot 'refresh-ui-build.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'UI build refresh failed. No application started.' }
}
$p02PreflightLine = & $p02Node --no-warnings (Join-Path $PSScriptRoot 'inspect.mjs') check
if ($LASTEXITCODE -ne 0) { throw 'Read-only public preflight failed. No application started.' }
Write-Host $p02PreflightLine
$p02Preflight = $p02PreflightLine | ConvertFrom-Json
& $p02Node (Join-Path $PSScriptRoot 'verified-build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Verified production build preflight failed. No application started.' }
if ($CheckOnly) { exit 0 }
$p02TraceLine = & $p02Node --no-warnings (Join-Path $PSScriptRoot 'prepare-tool-trace.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Tool trace preparation failed. No application started.' }
$p02Trace = $p02TraceLine | ConvertFrom-Json
Write-Host ('Tool trace case: ' + $p02Trace.caseId)
$p02PreviousData = $env:TAPKIT_DATA_DIR
$p02PreviousFixture = $env:TAPKIT_CHAT_FIXTURE
$p02PreviousBuild = $env:TAPKIT_TEST_BUILD
$p02PreviousRunAsNode = $env:ELECTRON_RUN_AS_NODE
$p02PreviousRenderer = $env:ELECTRON_RENDERER_URL
$p02PreviousTrace = $env:TAPKIT_TOOL_TRACE
$p02PreviousTraceProfile = $env:TAPKIT_TOOL_TRACE_PROFILE
$p02PreviousTraceCase = $env:TAPKIT_TOOL_TRACE_CASE
try {
  $env:TAPKIT_DATA_DIR = $p02Profile
  $env:TAPKIT_CHAT_FIXTURE = $null
  $env:TAPKIT_TEST_BUILD = $null
  $env:ELECTRON_RUN_AS_NODE = $null
  $env:ELECTRON_RENDERER_URL = $null
  $env:TAPKIT_TOOL_TRACE = 'P02-02'
  $env:TAPKIT_TOOL_TRACE_PROFILE = $p02Trace.profileId
  $env:TAPKIT_TOOL_TRACE_CASE = $p02Trace.caseId
  Write-Host ('Acceptance data directory: ' + $p02Profile)
  Write-Host 'Loading the current reviewed production build. Use the existing saved Chat/FlashX account; do not re-enter the Key.'
  if ($p02Preflight.launchMode -eq 'connection_recovery') {
    Write-Host ('The saved account needs connection recovery. Last fixed error: ' + $p02Preflight.lastErrorCode)
    Write-Host 'Open Settings > Model connections. Run one check for the existing test1 account.'
    Write-Host 'Do not send the queue test until the account is ready. If the check fails, report its fixed diagnostic and stop.'
  } else {
    Write-Host 'Continue the pending P02 batch checklist. Current-account verification remains in effect; previously accepted tests stay recorded.'
  }
  $p02Electron = Join-Path $p02Root 'node_modules/electron/dist/electron.exe'
  $p02App = Start-Process -FilePath $p02Electron -ArgumentList @(('"' + (Join-Path $p02Root 'apps/desktop') + '"')) -WorkingDirectory $p02Root -WindowStyle Normal -PassThru -Wait
  $p02Exit = $p02App.ExitCode
} finally {
  $env:TAPKIT_DATA_DIR = $p02PreviousData
  $env:TAPKIT_CHAT_FIXTURE = $p02PreviousFixture
  $env:TAPKIT_TEST_BUILD = $p02PreviousBuild
  $env:ELECTRON_RUN_AS_NODE = $p02PreviousRunAsNode
  $env:ELECTRON_RENDERER_URL = $p02PreviousRenderer
  $env:TAPKIT_TOOL_TRACE = $p02PreviousTrace
  $env:TAPKIT_TOOL_TRACE_PROFILE = $p02PreviousTraceProfile
  $env:TAPKIT_TOOL_TRACE_CASE = $p02PreviousTraceCase
}
exit $p02Exit
