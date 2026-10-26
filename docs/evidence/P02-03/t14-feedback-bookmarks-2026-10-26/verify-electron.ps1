param([string]$RunName = 'electron-first', [string]$Grep = 'P02-03 T14|P02-03 T06 two turns|P02-01 navigation')
$ErrorActionPreference = 'Stop'
$tapkitRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$tapkitFiles = @(
  'docs/evidence/P02-03/branches-and-feedback.png',
  'docs/evidence/P02-03/navigation-icons-2026-10-23/rounded-icons-light.png',
  'docs/evidence/P02-03/navigation-icons-2026-10-23/sidebar-icons-light.png',
  'docs/evidence/P02-03/navigation-icons-2026-10-23/rounded-icons-dark-200.png',
  'docs/evidence/P02-03/navigation-icons-2026-10-23/sidebar-icons-dark-200.png',
  'docs/evidence/P02-03/navigation-icons-2026-10-23/navigation-geometry.json'
)
$tapkitBackup = Join-Path $tapkitRoot ('.test-data/t14-evidence-backup-' + [guid]::NewGuid().ToString('N'))
$tapkitOutput = Join-Path $PSScriptRoot ('related-tests/' + $RunName)
New-Item -ItemType Directory -Force -Path $tapkitBackup, $tapkitOutput | Out-Null
$tapkitOriginal = @{}
foreach ($tapkitFile in $tapkitFiles) {
  $tapkitPath = Join-Path $tapkitRoot $tapkitFile
  if (Test-Path -LiteralPath $tapkitPath) {
    $tapkitOriginal[$tapkitFile] = (Get-FileHash -LiteralPath $tapkitPath -Algorithm SHA256).Hash
    Copy-Item -LiteralPath $tapkitPath -Destination (Join-Path $tapkitBackup ([IO.Path]::GetFileName($tapkitFile)))
  }
}
$tapkitExit = 1
$tapkitRestored = $false
Push-Location $tapkitRoot
try {
  & ./scripts/pnpm.ps1 test:e2e -- --grep $Grep --timeout=180000 2>&1 | Tee-Object -FilePath (Join-Path $PSScriptRoot ($RunName + '.log'))
  $tapkitExit = $LASTEXITCODE
} catch {
  $_ | Out-String | Tee-Object -FilePath (Join-Path $PSScriptRoot ($RunName + '.log')) -Append
} finally {
  foreach ($tapkitFile in $tapkitOriginal.Keys) {
    $tapkitPath = Join-Path $tapkitRoot $tapkitFile
    if (Test-Path -LiteralPath $tapkitPath) { Copy-Item -LiteralPath $tapkitPath -Destination (Join-Path $tapkitOutput ([IO.Path]::GetFileName($tapkitFile))) }
    Copy-Item -LiteralPath (Join-Path $tapkitBackup ([IO.Path]::GetFileName($tapkitFile))) -Destination $tapkitPath
    if ((Get-FileHash -LiteralPath $tapkitPath -Algorithm SHA256).Hash -ne $tapkitOriginal[$tapkitFile]) { throw 'Historical evidence restore failed' }
  }
  $tapkitRestored = $true
  Pop-Location
  @{ exitCode=$tapkitExit; historicalEvidenceRestored=$tapkitRestored; originalSha256=$tapkitOriginal; backup=$tapkitBackup } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot ($RunName + '.json')) -Encoding utf8
}
exit $tapkitExit
