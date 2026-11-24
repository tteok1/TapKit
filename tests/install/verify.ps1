param(
  [Parameter(Mandatory=$true)][string]$Packages,
  [ValidateSet('CI','Win11')][string]$Environment = 'Win11',
  [Parameter(Mandatory=$true)][string]$Report
)
$ErrorActionPreference = 'Stop'
$groups = (& "$env:SystemRoot\System32\whoami.exe" /groups /fo csv /nh | Out-String)
if ($groups -match '\bS-1-5-32-544\b' -or $groups -notmatch '\bS-1-16-8192\b') {
  throw 'P11-02 requires a standard user without membership in Administrators.'
}
$os = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$workstation = $os.InstallationType -eq 'Client'
if ($Environment -eq 'Win11' -and (!$workstation -or [int]$os.CurrentBuildNumber -lt 22000)) {
  throw 'Use a clean Windows 11 workstation.'
}
$prerequisites = @('node.exe','python.exe','git.exe','winword.exe','excel.exe','soffice.exe')
$preinstalled = @($prerequisites | ForEach-Object { Get-Command $_ -ErrorAction SilentlyContinue } |
  Where-Object { $_.Source -notlike '*\Microsoft\WindowsApps\*' })
if ($Environment -eq 'Win11' -and ($preinstalled.Count -or
    (Test-Path 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration'))) {
  throw 'Clean Win11 scope requires no external runtimes or Office installation.'
}
$env:Path = "$env:SystemRoot\System32;$env:SystemRoot;$PSHOME"
$programs = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs'
$profile = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'TapKit'
$app = Join-Path $programs 'TapKit'
$stage = Join-Path $programs '.TapKit-stage'
$previous = Join-Path $programs '.TapKit-previous'
$journal = Join-Path $programs '.TapKit-setup.json'
$lastError = Join-Path $programs '.TapKit-setup-error.txt'
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TapKit'
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'TapKit.lnk'
foreach ($path in @($profile,$app,$previous,$stage,$journal,$registry,$menu)) {
  if (Test-Path -LiteralPath $path) { throw 'Use a fresh account with no TapKit installation or profile.' }
}

$fixtureRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('P11-02-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixtureRoot
$utf8 = [Text.UTF8Encoding]::new($false)
$chinese = ([char]0x6D4B).ToString() + ([char]0x8BD5).ToString()
$userFiles = Join-Path $fixtureRoot ($chinese + ' external files')
$null = New-Item -ItemType Directory -Path $userFiles
$outside = Join-Path $userFiles 'user-export.txt'
$repo = Join-Path $userFiles 'original-repo'
$null = New-Item -ItemType Directory -Path $repo
$original = Join-Path $repo 'keep.txt'
[IO.File]::WriteAllText($outside, 'external export')
[IO.File]::WriteAllText($original, 'original repo')
$receipt = [ordered]@{
  scope = $Environment; windowsBuild = $os.CurrentBuildNumber; workstation = $workstation
  standardUser = $true; installerPathOnly = $true; artifactHashes = @()
  cases = [System.Collections.Generic.List[object]]::new()
}
function Assert-Case([bool]$Condition, [string]$Name) {
  $receipt.cases.Add([ordered]@{ case = $Name; passed = $Condition })
  Write-Host "P11-02 $Name -> $Condition"
  if (!$Condition) { throw "P11-02 failed: $Name" }
}
function Invoke-Installer([string]$File, [int]$Expected = 0, [string]$Arguments = '/S') {
  $process = Start-Process -FilePath $File -ArgumentList $Arguments -WindowStyle Hidden -PassThru -Wait
  if ($process.ExitCode -ne $Expected) {
    $detail = if (Test-Path -LiteralPath $lastError) { [IO.File]::ReadAllText($lastError) } else { 'setup did not record a status' }
    throw "Installer exit: $($process.ExitCode), expected $Expected ($detail)."
  }
}
function Assert-Version([string]$Version) {
  $installed = Get-Content -LiteralPath (Join-Path $app 'resources\tapkit\installation.json') -Raw | ConvertFrom-Json
  Assert-Case ($installed.version -eq $Version -and (Get-ItemProperty -LiteralPath $registry).DisplayVersion -eq $Version -and
    (Test-Path -LiteralPath $menu)) "registered-$Version"
}
function Fixture([string]$Step) {
  $payload = Join-Path $app 'resources\tapkit'
  $lock = Get-Content -LiteralPath (Join-Path $payload 'runtime-lock.json') -Raw | ConvertFrom-Json
  $node = Join-Path $payload ('.runtime\node\' + $lock.runtimes.node.directory + '\node.exe')
  & $node (Join-Path $PSScriptRoot 'profile.cjs') $payload $profile $Step
  Assert-Case ($LASTEXITCODE -eq 0) ('storage-' + $Step)
}

try {
  $build = Get-Content -LiteralPath (Join-Path $Packages 'build-receipt.json') -Raw | ConvertFrom-Json
  Assert-Case ($build.channel -eq 'development' -and $build.signed -eq $false -and $build.artifacts.Count -eq 2) 'development-build-pair'
  $sorted = @($build.artifacts | Sort-Object { [version]$_.version })
  $bases = @()
  foreach ($item in $sorted) {
    if ($item.name -notmatch '^TapKit-\d{1,5}\.\d{1,5}\.\d{1,5}-windows-x64-development\.exe$') {
      throw 'Unexpected installer filename.'
    }
    $file = Join-Path $Packages $item.name
    $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
    Assert-Case ($sha -eq $item.sha256 -and $sha -eq ((Get-Content -LiteralPath ($file + '.sha256') -Raw) -split '\s+')[0]) 'sha256'
    Assert-Case ((Get-AuthenticodeSignature -LiteralPath $file).Status -eq 'NotSigned') 'unsigned-development'
    $receipt.artifactHashes += $sha
    $bases += $file
  }
  $base, $next = $bases
  $from, $to = $sorted.version
  Invoke-Installer $base
  Assert-Version $from
  $hostOut = Join-Path $fixtureRoot 'host.out'
  $hostErr = Join-Path $fixtureRoot 'host.err'
  $tapkit = Start-Process -FilePath (Join-Path $app 'TapKit.exe') -PassThru -RedirectStandardOutput $hostOut -RedirectStandardError $hostErr
  $probe = Join-Path $profile 'runtime-capabilities.json'
  $deadline = [DateTime]::UtcNow.AddMinutes(15)
  while (!(Test-Path -LiteralPath $probe) -and !$tapkit.HasExited -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 2
  }
  Assert-Case (!$tapkit.HasExited -and (Test-Path -LiteralPath (Join-Path $profile 'db\app.sqlite'))) 'packaged-host-sqlite'
  Assert-Case (Test-Path -LiteralPath $probe) 'packaged-native-receipt'
  $capabilities = Get-Content -LiteralPath $probe -Raw | ConvertFrom-Json
  $receipt.native = @{ passed = $capabilities.tests.passed; total = $capabilities.tests.total; standardUser = $capabilities.standardUser; missing = $capabilities.missingCases.Count; failure = $capabilities.capabilities.nativeExecution.reason; failedCases = $capabilities.failedCases }
  Assert-Case ($capabilities.standardUser -eq $true -and $capabilities.tests.passed -eq 22 -and
    $capabilities.tests.failed -eq 0 -and $capabilities.tests.pending -eq 0 -and $capabilities.missingCases.Count -eq 0 -and
    $capabilities.capabilities.nativeExecution.status -eq 'available' -and
    $capabilities.capabilities.officeRender.status -eq 'available' -and
    $capabilities.capabilities.terminal.status -eq 'available') 'packaged-standard-user-isolation-and-office'

  $interrupted = Start-Process -FilePath $next -ArgumentList '/S' -WindowStyle Hidden -PassThru
  $deadline = [DateTime]::UtcNow.AddMinutes(2)
  while (!(Test-Path -LiteralPath $stage) -and !$interrupted.HasExited -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
  }
  Assert-Case (!$interrupted.HasExited -and (Test-Path -LiteralPath $stage)) 'interruption-during-staging'
  Stop-Process -Id $interrupted.Id -Force
  $interrupted.WaitForExit()
  Assert-Version $from
  Fixture 'seed'
  Invoke-Installer $next 1
  Assert-Case ([IO.File]::ReadAllText($lastError) -eq 'DATABASE_MIGRATION') 'rejected-invalid-migration'
  Assert-Case ($tapkit.HasExited -and !(Test-Path -LiteralPath $journal)) 'coordinated-close-and-failed-migration-rollback'
  Assert-Version $from
  Fixture 'verify-25'

  # Recreate the durable state of a power loss after both program and DB swaps.
  # A retry with the still-failing migration exposes whether the old pre-image returned.
  $id = [Guid]::NewGuid().ToString('N')
  $dbDir = Join-Path $profile 'db'
  $live = Join-Path $dbDir 'app.sqlite'
  $transaction = Join-Path $dbDir ('.tapkit-setup-' + $id)
  $null = New-Item -ItemType Directory -Path $transaction
  $candidate = Join-Path $transaction 'prepared.sqlite'
  Copy-Item -LiteralPath $live -Destination $candidate
  [IO.File]::Replace($candidate, $live, (Join-Path $transaction 'original.sqlite'))
  Fixture 'mutate-interrupted-copy'
  [IO.Directory]::Move($app, $previous)
  $null = New-Item -ItemType Directory -Path (Join-Path $app 'resources\tapkit') -Force
  Copy-Item -LiteralPath (Join-Path $previous 'resources\tapkit\installation.json') -Destination (Join-Path $app 'resources\tapkit')
  $interruptedState = @{ operation = 'install'; hadInstall = $true; data = $profile; id = $id }
  [IO.File]::WriteAllText($journal, ($interruptedState | ConvertTo-Json -Compress), $utf8)
  Invoke-Installer $next 1
  Assert-Version $from
  Fixture 'verify-25'
  Assert-Case (!(Test-Path -LiteralPath $previous) -and !(Test-Path -LiteralPath $journal)) 'interruption-after-swap-restores-app-and-db'

  Fixture 'repair'
  Invoke-Installer $next
  Assert-Version $to
  Fixture 'verify-26'
  $snapshots = @(Get-ChildItem (Join-Path $profile 'backups\migrations') -Filter 'pre-install-*.sqlite')
  Assert-Case ($snapshots.Count -ge 1) 'sqlite-backup-before-activation'

  Fixture 'future'
  Invoke-Installer $next 1
  Assert-Case ([IO.File]::ReadAllText($lastError) -eq 'DATABASE_NEWER') 'rejected-future-schema'
  Assert-Version $to
  Fixture 'verify-65535'
  Fixture 'restore-schema'
  Invoke-Installer (Join-Path $app 'Uninstall.exe')
  Assert-Case (!(Test-Path -LiteralPath $app) -and !(Test-Path -LiteralPath $registry) -and
    !(Test-Path -LiteralPath $menu) -and (Test-Path -LiteralPath (Join-Path $profile 'db\app.sqlite'))) 'uninstall-keeps-data'
  Invoke-Installer $next
  Fixture 'verify-26'
  $moved = Join-Path $userFiles ('TapKit-' + [Guid]::NewGuid().ToString())
  $null = New-Item -ItemType Directory -Path $moved
  Copy-Item -LiteralPath (Join-Path $profile 'db') -Destination $moved -Recurse
  $pointer = @{ schemaVersion = 1; path = $moved } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText((Join-Path $profile 'data-root-v1.json'), $pointer, $utf8)
  Invoke-Installer (Join-Path $app 'Uninstall.exe') 0 '/S /CLEAR-DATA'
  Assert-Case (!(Test-Path -LiteralPath $profile) -and !(Test-Path -LiteralPath $moved) -and !(Test-Path -LiteralPath $app)) 'uninstall-clears-data-and-moved-root'
  Assert-Case (([IO.File]::ReadAllText($outside) -eq 'external export') -and
    ([IO.File]::ReadAllText($original) -eq 'original repo')) 'external-files-untouched'
} finally {
  if ($tapkit -and !$tapkit.HasExited) { Stop-Process -Id $tapkit.Id -Force }
  $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Report -Encoding utf8
}
