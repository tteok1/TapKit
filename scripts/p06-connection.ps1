param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$p06Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$p06Node = Join-Path $p06Root '.runtime/node/node-v24.21.0-win-x64/node.exe'
$p06Mode = if ($CheckOnly) { '--check-only' } else { '--prepare' }
$p06Line = & $p06Node --no-warnings (Join-Path $PSScriptRoot 'p06-connection.mjs') $p06Mode
if ($LASTEXITCODE -ne 0) { throw 'P06 connection preparation failed. Nothing started.' }
$p06Profile = $p06Line | ConvertFrom-Json
if ($CheckOnly) { $p06Profile | ConvertTo-Json; exit 0 }
$p06Names = @('TAPKIT_DATA_DIR','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','TAPKIT_TEST_BUILD','TAPKIT_CHAT_FIXTURE','TAPKIT_WEB_FIXTURE','TAPKIT_P06_LIVE','TAPKIT_TOOL_TRACE','TAPKIT_STARTUP_DIAGNOSTICS')
$p06Saved = @{}
foreach ($p06Name in $p06Names) { $p06Saved[$p06Name] = [Environment]::GetEnvironmentVariable($p06Name, 'Process') }
try {
  foreach ($p06Name in $p06Names) { [Environment]::SetEnvironmentVariable($p06Name, $null, 'Process') }
  [Environment]::SetEnvironmentVariable('TAPKIT_DATA_DIR', $p06Profile.directory, 'Process')
  $p06App = Start-Process -FilePath (Join-Path $p06Root 'node_modules/electron/dist/electron.exe') -ArgumentList @(('"' + (Join-Path $p06Root 'apps/desktop') + '"')) -WorkingDirectory $p06Root -WindowStyle Normal -PassThru
  Write-Host ('TapKit connection debug window started. PID: ' + $p06App.Id)
  Write-Host ('Data directory: ' + $p06Profile.directory)
  Write-Host ('Existing account: ' + $p06Profile.accountLabel + ' / ' + $p06Profile.modelId)
  Write-Host 'Open Settings > Model connections and check the existing account manually.'
  Write-Host 'No P06 test, connection check, or model request is started automatically.'
  Write-Host 'Your connection changes will be kept in this debug profile. Do not start Work tests yet.'
} finally {
  foreach ($p06Name in $p06Names) { [Environment]::SetEnvironmentVariable($p06Name, $p06Saved[$p06Name], 'Process') }
}
