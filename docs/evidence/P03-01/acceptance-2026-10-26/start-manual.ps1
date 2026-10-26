param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$tapkitRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$tapkitPointer = Get-Content -LiteralPath (Join-Path $tapkitRoot '.test-data/current-ui-review.json') -Raw | ConvertFrom-Json
$tapkitReview = [IO.Path]::GetFullPath((Join-Path $tapkitRoot $tapkitPointer.reviewPath))
$tapkitEvidenceRoot = [IO.Path]::GetFullPath((Join-Path $tapkitRoot 'docs/evidence/P02-03')) + [IO.Path]::DirectorySeparatorChar
if (-not $tapkitReview.StartsWith($tapkitEvidenceRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($tapkitReview) -ne 'results.json') { throw 'Unexpected verified-build pointer.' }
$tapkitVerified = Get-Content -LiteralPath $tapkitReview -Raw | ConvertFrom-Json
if ($tapkitVerified.electron.exitCode -ne 0 -or $tapkitVerified.checks.check.exitCode -ne 0 -or $tapkitVerified.checks.'docs:check'.exitCode -ne 0) { throw 'Build verification is incomplete.' }
foreach ($tapkitGroup in @($tapkitVerified.productSourceSha256, $tapkitVerified.production.artifactSha256)) {
    foreach ($tapkitEntry in $tapkitGroup.PSObject.Properties) {
        $tapkitActual = (Get-FileHash -LiteralPath (Join-Path $tapkitRoot $tapkitEntry.Name) -Algorithm SHA256).Hash
        if ($tapkitActual -ne $tapkitEntry.Value) { throw ('Verified source/build changed: ' + $tapkitEntry.Name) }
    }
}
$tapkitManualRoot = Join-Path $tapkitRoot '.test-data/acceptance-manual-2026-10-26'
foreach ($tapkitPath in @((Join-Path $tapkitRoot '.test-data'), $tapkitManualRoot, (Join-Path $tapkitManualRoot 'profile'), (Join-Path $tapkitManualRoot 'downloads'))) {
    if ((Test-Path -LiteralPath $tapkitPath) -and ((Get-Item -LiteralPath $tapkitPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked manual-test directories are not supported.' }
}
if ($CheckOnly) { Write-Output 'Verified build and isolated manual-test path; no application started.'; exit 0 }
$tapkitRunning = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ($tapkitRoot + '\node_modules\*') -and [IO.Path]::GetFileName($_.Path) -eq 'electron.exe' }
if ($tapkitRunning) { throw 'Exit TapKit from the tray before starting the isolated manual-test window.' }
[IO.Directory]::CreateDirectory((Join-Path $tapkitManualRoot 'downloads')) | Out-Null
$tapkitEnvironment = @{}
foreach ($tapkitName in @('TAPKIT_DATA_DIR','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','TAPKIT_TEST_BUILD','TAPKIT_CHAT_FIXTURE','TAPKIT_TOOL_TRACE','TAPKIT_TOOL_TRACE_PROFILE','TAPKIT_TOOL_TRACE_CASE','REMOTE_DEBUGGING_PORT','V8_INSPECTOR_PORT','NO_SANDBOX')) {
    $tapkitEnvironment[$tapkitName] = [Environment]::GetEnvironmentVariable($tapkitName, 'Process')
    [Environment]::SetEnvironmentVariable($tapkitName, $null, 'Process')
}
try {
    $env:TAPKIT_DATA_DIR = Join-Path $tapkitManualRoot 'profile'
    $env:NO_SANDBOX = '0'
    Write-Output ('Opening isolated manual profile: ' + $env:TAPKIT_DATA_DIR)
    Start-Process -FilePath (Join-Path $tapkitRoot 'node_modules/electron/dist/electron.exe') -ArgumentList @(('"' + (Join-Path $tapkitRoot 'apps/desktop') + '"')) -WorkingDirectory $tapkitRoot -WindowStyle Normal
} finally {
    foreach ($tapkitName in $tapkitEnvironment.Keys) { [Environment]::SetEnvironmentVariable($tapkitName, $tapkitEnvironment[$tapkitName], 'Process') }
}
