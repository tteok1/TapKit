param(
  [Parameter(Mandatory=$true)][ValidateSet('Prepare','Install','Scope','Uninstall')][string]$Action,
  [ValidateSet('keep','clear')][string]$Data = 'keep'
)
$ErrorActionPreference = 'Stop'
$programs = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs'
$profile = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'TapKit'
$app = Join-Path $programs 'TapKit'
$stage = Join-Path $programs '.TapKit-stage'
$previous = Join-Path $programs '.TapKit-previous'
$journal = Join-Path $programs '.TapKit-setup.json'
$committed = Join-Path $programs '.TapKit-committed.json'
$lastError = Join-Path $programs '.TapKit-setup-error.txt'
$registration = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TapKit'
$login = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'TapKit.lnk'
$metadata = 'resources\tapkit\installation.json'
$utf8 = [Text.UTF8Encoding]::new($false)
$result = Join-Path $PSScriptRoot 'result.txt'

function Assert-LocalPath([string]$Path) {
  if ($Path -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetFullPath($Path) -ne $Path) {
    throw 'UNSAFE_PATH'
  }
  for ($at = $Path; $at; $at = [IO.Path]::GetDirectoryName($at)) {
    $item = Get-Item -LiteralPath $at -Force -ErrorAction SilentlyContinue
    if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'UNSAFE_PATH'
    }
  }
}

function Remove-OwnedDirectory([string]$Path) {
  Assert-LocalPath $Path
  if ([IO.Directory]::Exists($Path)) {
    # Directory.Delete on Windows removes directory junctions inside the tree as
    # links. It does not recurse through them. The owned root itself cannot be a link.
    [IO.Directory]::Delete($Path, $true)
  }
}

function Read-Installation([string]$Path) {
  $file = Join-Path $Path $metadata
  Assert-LocalPath $file
  $value = [IO.File]::ReadAllText($file) | ConvertFrom-Json
  if ($value.product -ne 'TapKit' -or $value.channel -ne 'development' -or
      $value.version -notmatch '^\d{1,5}\.\d{1,5}\.\d{1,5}$') { throw 'INSTALL_IDENTITY' }
  return $value
}

function Read-DataDirectory([switch]$AllowMissing) {
  Assert-LocalPath $profile
  $file = Join-Path $profile 'data-root-v1.json'
  Assert-LocalPath $file
  if (![IO.File]::Exists($file)) { return $profile }
  $pointer = [IO.File]::ReadAllText($file) | ConvertFrom-Json
  $path = [string]$pointer.path
  Assert-LocalPath $path
  if ($pointer.schemaVersion -ne 1 -or
      [IO.Path]::GetFileName($path) -notmatch '^TapKit-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$' -or
      $path.StartsWith($programs + '\', [StringComparison]::OrdinalIgnoreCase) -or
      $path.StartsWith($profile + '\', [StringComparison]::OrdinalIgnoreCase) -or
      (!$AllowMissing -and ![IO.Directory]::Exists($path))) { throw 'DATA_LOCATION' }
  return $path
}

function Register-Application {
  $version = (Read-Installation $app).version
  New-Item -Path $registration -Force | Out-Null
  $executable = Join-Path $app 'TapKit.exe'
  $uninstaller = Join-Path $app 'Uninstall.exe'
  $properties = @{
    DisplayName = 'TapKit (Development Test)'
    DisplayVersion = $version
    DisplayIcon = $executable
    Publisher = 'TapKit'
    InstallLocation = $app
    UninstallString = '"' + $uninstaller + '"'
    QuietUninstallString = '"' + $uninstaller + '" /S'
  }
  foreach ($name in $properties.Keys) {
    New-ItemProperty -LiteralPath $registration -Name $name -Value $properties[$name] -Force | Out-Null
  }
  foreach ($name in @('NoModify','NoRepair')) {
    New-ItemProperty -LiteralPath $registration -Name $name -Value 1 -PropertyType DWord -Force | Out-Null
  }
  Assert-LocalPath $startMenu
  $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($startMenu))
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($startMenu)
  $link.TargetPath = $executable
  $link.WorkingDirectory = $app
  $link.Save()
}

function Unregister-Application {
  if (Test-Path -LiteralPath $registration) { Remove-Item -LiteralPath $registration -Force }
  Assert-LocalPath $startMenu
  [IO.File]::Delete($startMenu)
}

function Start-Transaction([string]$Operation, [bool]$HasApp, [string]$DataDirectory) {
  $state = @{ operation = $Operation; hadInstall = $HasApp; data = $DataDirectory; id = [Guid]::NewGuid().ToString('N') }
  $temporary = $journal + '.tmp'
  Assert-LocalPath $temporary
  [IO.File]::WriteAllText($temporary, ($state | ConvertTo-Json -Compress), $utf8)
  $handle = [IO.File]::Open($temporary, 'Open', 'ReadWrite', 'None')
  try { $handle.Flush($true) } finally { $handle.Dispose() }
  [IO.File]::Move($temporary, $journal)
  return $state
}

function Get-StorageTransaction($State) {
  $path = Join-Path $State.data ('db\.tapkit-setup-' + $State.id)
  Assert-LocalPath $path
  return $path
}

function Read-Transaction([string]$Path) {
  $state = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
  if ($state.id -notmatch '^[a-f0-9]{32}$' -or $state.hadInstall -isnot [bool] -or
      $state.operation -notin @('install','uninstall')) { throw 'INSTALL_JOURNAL' }
  return $state
}

function Recover-Transaction {
  if (![IO.File]::Exists($journal)) { return }
  $state = Read-Transaction $journal
  if ($state.operation -eq 'install') {
    if ($state.data -ne (Read-DataDirectory)) { throw 'DATA_LOCATION_CHANGED' }
    $transaction = Get-StorageTransaction $state
    $original = Join-Path $transaction 'original.sqlite'
    $database = Join-Path $state.data 'db\app.sqlite'
    Assert-LocalPath $original
    Assert-LocalPath $database
    if ([IO.File]::Exists($original)) {
      [IO.File]::Replace($original, $database, [NullString]::Value)
    }
    Remove-OwnedDirectory $transaction
  }
  if ([IO.Directory]::Exists($previous)) {
    $null = Read-Installation $previous
    if ([IO.Directory]::Exists($app)) {
      $null = Read-Installation $app
      Remove-OwnedDirectory $app
    }
    [IO.Directory]::Move($previous, $app)
  }
  if ($state.hadInstall) { Register-Application }
  else {
    if ([IO.Directory]::Exists($app)) {
      $null = Read-Installation $app
      Remove-OwnedDirectory $app
    }
    Unregister-Application
  }
  [IO.File]::Delete($journal)
}

function Remove-CompletedTransaction {
  if (![IO.File]::Exists($committed)) { return }
  $state = Read-Transaction $committed
  if ($state.operation -eq 'install') {
    # DATA may have moved after commit. Only remove the original transaction
    # folder when the recorded location is still the active owned profile.
    if ($state.data -eq (Read-DataDirectory)) { Remove-OwnedDirectory (Get-StorageTransaction $state) }
  }
  if ([IO.Directory]::Exists($previous)) {
    $null = Read-Installation $previous
    Remove-OwnedDirectory $previous
  }
  [IO.File]::Delete($committed)
}

function Complete-Transaction {
  # This rename is the commit point. A committed marker is for cleanup only.
  [IO.File]::Move($journal, $committed)
  try { Remove-CompletedTransaction } catch { Write-Host 'INSTALL_CLEANUP_PENDING' }
}

function Get-TapKitProcesses {
  $exe = Join-Path $app 'TapKit.exe'
  return @(Get-Process -Name 'TapKit' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $exe })
}

function Close-Application {
  if (!(Get-TapKitProcesses)) { return }
  $closed = $journal + '.closed'
  Assert-LocalPath $closed
  [IO.File]::Delete($closed)
  Start-Process -FilePath (Join-Path $app 'TapKit.exe') -ArgumentList '--tapkit-setup-close' -WindowStyle Hidden
  $until = [DateTime]::UtcNow.AddSeconds(60)
  do {
    Start-Sleep -Milliseconds 200
    if ([IO.File]::Exists($closed) -and !(Get-TapKitProcesses)) {
      [IO.File]::Delete($closed)
      return
    }
  } while ([DateTime]::UtcNow -lt $until)
  throw 'APPLICATION_BUSY'
}

function Install-Application {
  $candidate = Read-Installation $stage
  $hasApp = [IO.Directory]::Exists($app)
  if ($hasApp -and [version]$candidate.version -lt [version](Read-Installation $app).version) {
    throw 'INSTALL_DOWNGRADE'
  }
  $dataDir = Read-DataDirectory
  $state = Start-Transaction 'install' $hasApp $dataDir
  Close-Application
  if ($dataDir -ne (Read-DataDirectory)) { throw 'DATA_LOCATION_CHANGED' }
  $transaction = Get-StorageTransaction $state
  Assert-LocalPath (Join-Path $dataDir 'db\app.sqlite')
  Assert-LocalPath (Join-Path $dataDir 'db\app.sqlite-wal')
  Assert-LocalPath (Join-Path $dataDir 'db\app.sqlite-shm')
  $payload = Join-Path $stage 'resources\tapkit'
  $runtime = [IO.File]::ReadAllText((Join-Path $payload 'runtime-lock.json')) | ConvertFrom-Json
  $node = Join-Path $payload ('.runtime\node\' + $runtime.runtimes.node.directory + '\node.exe')
  Assert-LocalPath $node
  $probe = Join-Path $PSScriptRoot 'storage-result.txt'
  Get-ChildItem Env: | Where-Object { $_.Name -in @('NODE_OPTIONS','NODE_PATH','NODE_V8_COVERAGE') } |
    ForEach-Object { Remove-Item ('Env:\' + $_.Name) }
  & $node (Join-Path $payload 'scripts\installer\storage.mjs') $stage $dataDir $transaction $probe
  if ($LASTEXITCODE -ne 0 -or ![IO.File]::Exists($probe)) {
    if ([IO.File]::Exists($probe)) { throw [IO.File]::ReadAllText($probe) }
    throw 'INSTALL_STORAGE_CHECK'
  }
  if ($hasApp) { [IO.Directory]::Move($app, $previous) }
  [IO.Directory]::Move($stage, $app)
  $prepared = Join-Path $transaction 'prepared.sqlite'
  if ([IO.File]::Exists($prepared)) {
    if ([IO.File]::Exists((Join-Path $dataDir 'db\app.sqlite-wal')) -or
        [IO.File]::Exists((Join-Path $dataDir 'db\app.sqlite-shm'))) { throw 'DATABASE_BUSY' }
    [IO.File]::Replace($prepared, (Join-Path $dataDir 'db\app.sqlite'), (Join-Path $transaction 'original.sqlite'))
  }
  Register-Application
  $snapshot = Join-Path $transaction 'before.sqlite'
  if ([IO.File]::Exists($snapshot)) {
    $backups = Join-Path $dataDir 'backups\migrations'
    Assert-LocalPath $backups
    $null = [IO.Directory]::CreateDirectory($backups)
    [IO.File]::Move($snapshot, (Join-Path $backups ('pre-install-' + $state.id + '.sqlite')))
  }
  Complete-Transaction
}

function Uninstall-Application {
  $null = Read-Installation $app
  $dataDir = if ($Data -eq 'clear') { Read-DataDirectory -AllowMissing } else { $profile }
  $null = Start-Transaction 'uninstall' $true $dataDir
  Close-Application
  if ($Data -eq 'clear') {
    if ($dataDir -ne (Read-DataDirectory -AllowMissing)) { throw 'DATA_LOCATION_CHANGED' }
    try {
      if ($dataDir -ne $profile) { Remove-OwnedDirectory $dataDir }
      Remove-OwnedDirectory $profile
    } catch { throw 'DATA_CLEAR_FAILED' }
  }
  [IO.Directory]::Move($app, $previous)
  Unregister-Application
  if (Test-Path -LiteralPath $login) {
    Remove-ItemProperty -LiteralPath $login -Name 'io.tapkit.desktop' -ErrorAction SilentlyContinue
  }
  Complete-Transaction
}

$lock = $null
try {
  foreach ($path in @($programs,$app,$stage,$previous,$journal,$committed,$lastError)) { Assert-LocalPath $path }
  if ($Action -ne 'Scope') {
    if (![IO.Directory]::Exists($programs)) { throw 'INSTALL_LOCATION' }
    $lockPath = Join-Path $programs '.TapKit-transaction.lock'
    Assert-LocalPath $lockPath
    $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    [IO.File]::Delete($lastError)
  }
  switch ($Action) {
    'Scope' {
      $location = Read-DataDirectory -AllowMissing
      [IO.File]::WriteAllText($result, $location, [Text.Encoding]::Unicode)
    }
    'Prepare' {
      Recover-Transaction
      Remove-CompletedTransaction
      Remove-OwnedDirectory $stage
    }
    'Install' { Install-Application }
    'Uninstall' {
      Recover-Transaction
      Remove-CompletedTransaction
      Uninstall-Application
    }
  }
  exit 0
} catch {
  $message = $_.Exception.Message
  if ($lock -and $Action -in @('Install','Uninstall')) {
    try { Recover-Transaction } catch { $message = 'INSTALL_ROLLBACK_PENDING' }
  }
  if ($message -notmatch '^[A-Z_]+(?:: [A-Za-z0-9._/ @+-]{1,180})?$') { $message = 'INSTALL_FILES_OR_PERMISSIONS' }
  if ($lock) { [IO.File]::WriteAllText($lastError, $message, $utf8) }
  [IO.File]::WriteAllText($result, $message, [Text.Encoding]::Unicode)
  exit 1
} finally {
  if ($lock) { $lock.Dispose() }
}
