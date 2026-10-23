param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$tapkitRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$tapkitReviewPath = Join-Path $PSScriptRoot 'results.json'
$tapkitPointerPath = Join-Path $tapkitRoot '.test-data/current-ui-review.json'
if (Test-Path -LiteralPath $tapkitPointerPath) {
    $tapkitPointer = Get-Content -LiteralPath $tapkitPointerPath -Raw | ConvertFrom-Json
    $tapkitReviewPath = [IO.Path]::GetFullPath((Join-Path $tapkitRoot $tapkitPointer.reviewPath))
    $tapkitReviewRoot = [IO.Path]::GetFullPath((Join-Path $tapkitRoot 'docs/evidence/P02-03')) + [IO.Path]::DirectorySeparatorChar
    if (-not $tapkitReviewPath.StartsWith($tapkitReviewRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($tapkitReviewPath) -ne 'results.json') {
        throw 'Unexpected UI review pointer.'
    }
}
$tapkitVerified = Get-Content -LiteralPath $tapkitReviewPath -Raw | ConvertFrom-Json
if ($tapkitVerified.electron.exitCode -ne 0 -or $tapkitVerified.checks.check.exitCode -ne 0 -or $tapkitVerified.checks.'docs:check'.exitCode -ne 0) {
    throw 'Current UI verification is incomplete.'
}
foreach ($tapkitGroup in @($tapkitVerified.productSourceSha256, $tapkitVerified.production.artifactSha256)) {
    foreach ($tapkitFile in $tapkitGroup.PSObject.Properties) {
        $tapkitActual = (Get-FileHash -LiteralPath (Join-Path $tapkitRoot $tapkitFile.Name) -Algorithm SHA256).Hash
        if ($tapkitActual -ne $tapkitFile.Value) { throw ('Source/build changed since verification: ' + $tapkitFile.Name) }
    }
}
$tapkitManifest = Get-Content -LiteralPath (Join-Path $tapkitRoot 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json') -Raw | ConvertFrom-Json
$tapkitProfile = [IO.Path]::GetFullPath($tapkitManifest.dataDir)
if ($tapkitManifest.root -ne $tapkitRoot -or [IO.Path]::GetDirectoryName($tapkitProfile) -ne (Join-Path $tapkitRoot '.test-data') -or [IO.Path]::GetFileName($tapkitProfile) -notlike 'P01-02-app-zhipu-chat-*') {
    throw 'Unexpected local profile.'
}
if ((Get-Item -LiteralPath $tapkitProfile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Profile links are not supported.' }
if ($CheckOnly) { Write-Output 'Verified current UI build and existing local profile; no application started.'; exit 0 }
$tapkitElectron = Join-Path $tapkitRoot 'node_modules/electron/dist/electron.exe'
$tapkitRunning = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $tapkitElectron }
if ($tapkitRunning) { throw 'Exit TapKit from the tray before opening the current production UI.' }
$tapkitEnvironment = @{}
foreach ($tapkitName in @('TAPKIT_DATA_DIR','ELECTRON_RUN_AS_NODE','ELECTRON_RENDERER_URL','TAPKIT_TEST_BUILD','TAPKIT_CHAT_FIXTURE','TAPKIT_TOOL_TRACE','TAPKIT_TOOL_TRACE_PROFILE','TAPKIT_TOOL_TRACE_CASE','REMOTE_DEBUGGING_PORT','V8_INSPECTOR_PORT','NO_SANDBOX')) {
    $tapkitEnvironment[$tapkitName] = [Environment]::GetEnvironmentVariable($tapkitName, 'Process')
    [Environment]::SetEnvironmentVariable($tapkitName, $null, 'Process')
}
try {
    $env:TAPKIT_DATA_DIR = $tapkitProfile
    $env:NO_SANDBOX = '0'
    Start-Process -FilePath $tapkitElectron -ArgumentList @(('"' + (Join-Path $tapkitRoot 'apps/desktop') + '"')) -WorkingDirectory $tapkitRoot -WindowStyle Normal
} finally {
    foreach ($tapkitName in $tapkitEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($tapkitName, $tapkitEnvironment[$tapkitName], 'Process')
    }
}
