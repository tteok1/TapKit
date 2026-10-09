$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$taskNode = Join-Path $PSScriptRoot '../.runtime/node/node-v24.21.0-win-x64/node.exe'
$taskPnpm = Join-Path $PSScriptRoot '../.cache/tools/pnpm/package/bin/pnpm.mjs'
$taskTitles = @{
  links = 'P00-03 T19 OfficeWorker preserves cached external-link data with an isolated refresh control'
  macro = 'P00-03 T08 T19 OfficeWorker blocks an executable embedded macro with an isolated positive control'
}
$taskDirectory = Join-Path $PSScriptRoot '../test-results/office-shutdown-diagnostics'
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
$taskResults = @()
foreach ($taskMode in @('links', 'macro')) {
 $taskTitle = $taskTitles[$taskMode]
 for ($taskIteration = 1; $taskIteration -le 3; $taskIteration++) {
  $taskReportName = if ($taskMode -eq 'links') { "round-$taskIteration.json" } else { "macro-round-$taskIteration.json" }
  $taskReportPath = Join-Path $taskDirectory $taskReportName
  Write-Output "OFFICE_SHUTDOWN_DIAGNOSTIC_REPEAT $taskIteration $taskMode"
  & $taskNode $taskPnpm test:integration tests/integration/P00-03.office.test.ts --testNamePattern $taskTitle --reporter=default --reporter=json --outputFile $taskReportPath
  $taskExitCode = $LASTEXITCODE
  $taskPassed = $false
  $taskReason = 'TEST_PROCESS_FAILED'
  try {
    $taskReport = Get-Content -LiteralPath $taskReportPath -Raw | ConvertFrom-Json
    $taskCases = @($taskReport.testResults | ForEach-Object { $_.assertionResults } | Where-Object { $_.title -eq $taskTitle })
    # Four other Office cases are deliberately filtered; the selected original case must pass.
    $taskPassed = $taskExitCode -eq 0 -and $taskReport.numPassedTests -eq 1 -and $taskReport.numFailedTests -eq 0 -and $taskCases.Count -eq 1 -and $taskCases[0].status -eq 'passed'
    if ($taskExitCode -eq 0 -and !$taskPassed) { $taskReason = 'SELECTED_CASE_NOT_VERIFIED' }
  } catch {
    $taskReason = 'TEST_REPORT_UNAVAILABLE'
  }
  $taskResults += [pscustomobject]@{ mode=$taskMode; round=$taskIteration; exitCode=$taskExitCode; passed=$taskPassed; reason=$(if ($taskPassed) { $null } else { $taskReason }) }
 }
}
$taskResults | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskDirectory 'summary.json') -Encoding utf8
$taskFailures = @($taskResults | Where-Object { !$_.passed }).Count
if ($taskFailures -ne 0) { throw "Office shutdown diagnostic checks failed: $taskFailures" }
