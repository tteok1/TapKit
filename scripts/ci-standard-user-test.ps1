$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -ne 'true' -or !$env:GITHUB_WORKSPACE -or !$env:RUNNER_TEMP) {
  throw 'This harness is restricted to an ephemeral GitHub Actions runner.'
}

$workspace = (Resolve-Path -LiteralPath $env:GITHUB_WORKSPACE).Path
$runnerTemp = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path
$node = Join-Path $workspace '.runtime/node/node-v24.21.0-win-x64/node.exe'
$standardUserKit = Join-Path $workspace 'scripts/standard-user-kit.mjs'
$standardUserTest = Join-Path $workspace 'scripts/standard-user-test.mjs'
$pnpm = Join-Path $workspace '.cache/tools/pnpm/package/bin/pnpm.mjs'
if (!(Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Locked Node runtime is missing.' }
if (!(Test-Path -LiteralPath $standardUserKit -PathType Leaf)) {
  throw 'Standard-user kit preparation entrypoint is missing.'
}
if (!(Test-Path -LiteralPath $standardUserTest -PathType Leaf)) {
  throw 'Standard-user test entrypoint is missing.'
}
if (!(Test-Path -LiteralPath $pnpm -PathType Leaf)) { throw 'Locked pnpm runtime is missing.' }

$suffix = [guid]::NewGuid().ToString('N')
$accountName = 'tapkit-' + $suffix.Substring(0, 12)
$identity = "$env:COMPUTERNAME\$accountName"
$kitParent = Join-Path $runnerTemp ('tapkit-standard-user-' + $suffix)
$destination = Join-Path $kitParent 'kit'
$logDirectory = Join-Path $runnerTemp ('tapkit-standard-user-logs-' + $suffix)
$evidenceDirectory = Join-Path $workspace 'ci-evidence/P00-03-standard-user'
$stdoutPath = Join-Path $logDirectory 'stdout.log'
$stderrPath = Join-Path $logDirectory 'stderr.log'
$reportPath = Join-Path $destination 'docs/evidence/P00-03/runtime-probe.json'
$probeLogPath = Join-Path $destination 'docs/evidence/P00-03/runtime-probe.log'
$nativeCasesPath = Join-Path $destination 'docs/evidence/P00-03/native-cases.jsonl'
$testResultsPath = Join-Path $destination 'test-results/P00-03-native.json'
$testDataPath = Join-Path $destination '.test-data'
$userCreated = $false

New-Item -ItemType Directory -Path $kitParent, $logDirectory, $evidenceDirectory | Out-Null

try {
  $password = ConvertTo-SecureString -String ('Aa9!' + [guid]::NewGuid().ToString('N')) -AsPlainText -Force
  New-LocalUser `
    -Name $accountName `
    -Password $password `
    -PasswordNeverExpires `
    -AccountNeverExpires `
    -Description 'Ephemeral P00-03 CI standard user' | Out-Null
  $userCreated = $true

  # Grant this throwaway account read/execute access only to source and locked runtimes.
  $readDirectories = @(
    'apps',
    'packages',
    'scripts',
    'tests',
    'resources',
    'native',
    'migrations',
    '.runtime/node',
    '.runtime/python',
    '.runtime/git',
    '.runtime/libreoffice'
  )
  foreach ($relativePath in $readDirectories) {
    $path = Join-Path $workspace $relativePath
    if (!(Test-Path -LiteralPath $path -PathType Container)) {
      throw "Required standard-user input directory is missing: $relativePath"
    }
    & icacls.exe $path /grant ($identity + ':(OI)(CI)(RX)') /T /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not grant read access to $relativePath." }
  }

  $readFiles = @(
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'runtime-lock.json',
    'native-lock.json',
    'dependency-baseline.json',
    'python-wheels.lock.json',
    'requirements.lock',
    'vitest.config.ts',
    'tsconfig.base.json',
    'tsconfig.json',
    '.npmrc'
  )
  foreach ($relativePath in $readFiles) {
    $path = Join-Path $workspace $relativePath
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Required standard-user input file is missing: $relativePath"
    }
    & icacls.exe $path /grant ($identity + ':R') /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not grant read access to $relativePath." }
  }

  & icacls.exe $workspace /grant ($identity + ':(RX)') /C /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not grant traversal to the checkout root.' }

  # PinnedPath opens each path ancestor with FILE_READ_ATTRIBUTES before it
  # reaches the test kit. Grant only traverse/read-attributes/synchronize on
  # the exact parent directories; do not inherit these rights to sibling kits.
  $ancestor = Get-Item -LiteralPath $kitParent
  while ($ancestor.Parent) {
    $ancestor = $ancestor.Parent
    if ($ancestor.Parent) {
      & icacls.exe $ancestor.FullName /grant ($identity + ':(X,RA,S)') /C /Q | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "Could not grant path traversal to $($ancestor.FullName)."
      }
    }
  }

  & icacls.exe $kitParent /grant ($identity + ':(OI)(CI)(M)') /C /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not grant access to the temporary test destination.' }

  # Prepare dependencies as the runner identity so the standard user never reads
  # the runner-wide pnpm content store. Copy package files into the isolated kit.
  & $node $standardUserKit $destination
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the standard-user test kit.' }

  # The runner creates these private runtime copies. The standard-user helper
  # needs WRITE_DAC on their existing descendants as well as the roots so
  # Windows can propagate/revoke each run's read/execute profile ACE.
  # Grant only DACL editing to the host test account, never to an AppContainer.
  $runtimeLock = Get-Content -LiteralPath (Join-Path $destination 'runtime-lock.json') -Raw | ConvertFrom-Json
  $runtimeRoots = @(
    (Join-Path (Join-Path $destination '.runtime/node') $runtimeLock.runtimes.node.directory),
    (Join-Path (Join-Path $destination '.runtime/python') $runtimeLock.runtimes.python.directory),
    (Join-Path (Join-Path $destination '.runtime/libreoffice') $runtimeLock.runtimes.libreoffice.directory)
  )
  $runtimeCopyPrefix = [System.IO.Path]::GetFullPath((Join-Path $destination '.runtime')).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  foreach ($runtimeRoot in $runtimeRoots) {
    $runtimeRoot = [System.IO.Path]::GetFullPath($runtimeRoot)
    if (!$runtimeRoot.StartsWith($runtimeCopyPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'DACL editing must stay inside the private runtime copy.'
    }
    if (!(Test-Path -LiteralPath $runtimeRoot -PathType Container)) {
      throw "Required locked runtime root is missing: $runtimeRoot"
    }
    & icacls.exe $runtimeRoot /grant ($identity + ':(WDAC)') /T /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'Could not grant DACL access to the private locked runtime copy.'
    }
  }

  # Record the existing permissions on the copied runtimes before launching the
  # standard-user probe. This is read-only evidence; it does not change ACLs.
  $nodeExecutable = Join-Path $runtimeRoots[0] $runtimeLock.runtimes.node.executable
  $pythonExecutable = Join-Path $runtimeRoots[1] $runtimeLock.runtimes.python.executable
  $officePython = Join-Path $runtimeRoots[2] 'program/python.exe'
  $officeLibrary = Join-Path $runtimeRoots[2] 'program/mergedlo.dll'
  $officeProgram = Join-Path $runtimeRoots[2] 'program'
  $officePythonCore = Get-ChildItem -LiteralPath $officeProgram -Directory -Filter 'python-core-*' | Select-Object -First 1
  $officePythonCoreBin = if ($officePythonCore) { Join-Path $officePythonCore.FullName 'bin' } else { Join-Path $officeProgram 'python-core-missing/bin' }
  $runtimeAclTargets = @(
    @{ name = 'runner-temp'; path = $runnerTemp },
    @{ name = 'kit-parent'; path = $kitParent },
    @{ name = 'kit-root'; path = $destination },
    @{ name = 'runtime-parent'; path = (Join-Path $destination '.runtime') },
    @{ name = 'node-parent'; path = (Split-Path -Parent $runtimeRoots[0]) },
    @{ name = 'node-root'; path = $runtimeRoots[0] },
    @{ name = 'node-executable'; path = $nodeExecutable },
    @{ name = 'python-parent'; path = (Split-Path -Parent $runtimeRoots[1]) },
    @{ name = 'python-root'; path = $runtimeRoots[1] },
    @{ name = 'python-executable'; path = $pythonExecutable },
    @{ name = 'python-dlls-directory'; path = (Join-Path $runtimeRoots[1] 'DLLs') },
    @{ name = 'office-parent'; path = (Split-Path -Parent $runtimeRoots[2]) },
    @{ name = 'office-root'; path = $runtimeRoots[2] },
    @{ name = 'office-program-directory'; path = $officeProgram },
    @{ name = 'office-soffice-executable'; path = (Join-Path $officeProgram 'soffice.exe') },
    @{ name = 'office-python-core-directory'; path = (Split-Path -Parent $officePythonCoreBin) },
    @{ name = 'office-python-core-bin'; path = $officePythonCoreBin },
    @{ name = 'office-python-core-executable'; path = (Join-Path $officePythonCoreBin 'python.exe') },
    @{ name = 'office-python'; path = $officePython },
    @{ name = 'office-mergedlo'; path = $officeLibrary }
  )
  foreach ($runtime in @(
    @{ name = 'node'; root = $runtimeRoots[0] },
    @{ name = 'python'; root = $runtimeRoots[1] },
    @{ name = 'python-dlls'; root = (Join-Path $runtimeRoots[1] 'DLLs') },
    @{ name = 'office-program'; root = $officeProgram },
    @{ name = 'office-python-core'; root = $officePythonCoreBin }
  )) {
    if (Test-Path -LiteralPath $runtime.root -PathType Container) {
      foreach ($binary in Get-ChildItem -LiteralPath $runtime.root -File | Where-Object { $_.Extension -in @('.dll', '.pyd') }) {
        $runtimeAclTargets += @{ name = $runtime.name + '-binary-' + $binary.Name; path = $binary.FullName }
      }
    }
  }
  $standardUserSid = (Get-LocalUser -Name $accountName).SID.Value
  $runtimeAclSnapshot = @(
    foreach ($target in $runtimeAclTargets) {
      try {
        $acl = Get-Acl -LiteralPath $target.path
        $rules = @(
          foreach ($rule in $acl.Access) {
            $sid = try {
              $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
            }
            catch {
              $rule.IdentityReference.Value
            }
            [pscustomobject]@{
              sid = $sid
              type = [string]$rule.AccessControlType
              rights = [string]$rule.FileSystemRights
              inherited = [bool]$rule.IsInherited
              inheritance = [string]$rule.InheritanceFlags
              propagation = [string]$rule.PropagationFlags
            }
          }
        )
        [pscustomobject]@{
          name = $target.name
          relativePath = [System.IO.Path]::GetRelativePath($kitParent, $target.path).Replace('\', '/')
          exists = $true
          rules = $rules
        }
      }
      catch {
        [pscustomobject]@{
          name = $target.name
          relativePath = [System.IO.Path]::GetRelativePath($kitParent, $target.path).Replace('\', '/')
          exists = $false
          errorCode = [int]$_.Exception.HResult
        }
      }
    }
  )
  [pscustomobject]@{
    capturedAt = [DateTime]::UtcNow.ToString('o')
    standardUserSid = $standardUserSid
    phase = 'before-appcontainer-run'
    paths = $runtimeAclSnapshot
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'runtime-acl.json') -Encoding utf8

  Push-Location $destination
  try {
    & $node $pnpm 'install' '--frozen-lockfile' '--ignore-scripts' '--package-import-method=copy'
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the locked dependencies into the isolated test kit.' }
  }
  finally {
    Pop-Location
  }

  $credential = [System.Management.Automation.PSCredential]::new($identity, $password)
  $arguments = '"{0}" "{1}" --prepared-kit' -f $standardUserTest, $destination
  $process = Start-Process `
    -FilePath $node `
    -ArgumentList $arguments `
    -Credential $credential `
    -LoadUserProfile `
    -UseNewEnvironment `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru `
    -Wait

  if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath | Write-Host }
  if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath | Write-Host }

  if (Test-Path -LiteralPath $reportPath) {
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if ($report.standardUser -ne $true) { throw 'Probe did not confirm a medium-integrity non-administrator account.' }
    if ($report.tests.failed -ne 0 -or $report.tests.pending -ne 0 -or $report.tests.passed -ne $report.tests.total) {
      if (Test-Path -LiteralPath $probeLogPath) {
        Write-Host 'Last 250 lines of the standard-user runtime probe:'
        Get-Content -LiteralPath $probeLogPath -Tail 250 | Write-Host
      }
      throw 'One or more current-route P00-03 integration cases did not pass.'
    }
    if ($report.missingCases.Count -ne 0) {
      if (Test-Path -LiteralPath $probeLogPath) {
        Write-Host 'Last 250 lines of the standard-user runtime probe:'
        Get-Content -LiteralPath $probeLogPath -Tail 250 | Write-Host
      }
      throw 'P00-03 runtime-probe acceptance cases are missing.'
    }
    foreach ($capability in @('nativeExecution', 'officeRender', 'terminal')) {
      if ($report.capabilities.$capability.status -ne 'available') {
        if (Test-Path -LiteralPath $probeLogPath) {
          Write-Host 'Last 250 lines of the standard-user runtime probe:'
          Get-Content -LiteralPath $probeLogPath -Tail 250 | Write-Host
        }
        throw "The standard-user probe did not enable $capability."
      }
    }
  }
  if ($process.ExitCode -ne 0) {
    if (Test-Path -LiteralPath $probeLogPath) {
      Write-Host 'Last 250 lines of the standard-user runtime probe:'
      Get-Content -LiteralPath $probeLogPath -Tail 250 | Write-Host
    }
    throw "Standard-user P00-03 runtime probe exited $($process.ExitCode)."
  }
  if (!(Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw 'Standard-user runtime-probe did not create its report.'
  }
  $parserReportPath = Join-Path $destination 'docs/evidence/P03-01/parser-probe.json'
  if (!(Test-Path -LiteralPath $parserReportPath -PathType Leaf)) {
    throw 'Standard-user P03 parser probe did not create its independent report.'
  }
  $parserReport = Get-Content -LiteralPath $parserReportPath -Raw | ConvertFrom-Json
  if ($parserReport.passed -ne $true -or $parserReport.standardUser -ne $true -or $parserReport.missingCases.Count -ne 0) {
    throw 'Standard-user P03 parser acceptance did not pass every required case.'
  }
}
finally {
  try {
    foreach ($artifact in @(
      @{ Source = $reportPath; Name = 'runtime-probe.json' },
      @{ Source = $probeLogPath; Name = 'runtime-probe.log' },
      @{ Source = $testResultsPath; Name = 'integration-test-results.json' },
      @{ Source = $nativeCasesPath; Name = 'standard-user-native-cases.jsonl' }
      @{ Source = (Join-Path $destination 'docs/evidence/P03-01/parser-probe.json'); Name = 'p03-parser-probe.json' },
      @{ Source = (Join-Path $destination 'docs/evidence/P03-01/parser-probe.log'); Name = 'p03-parser-probe.log' },
      @{ Source = (Join-Path $destination 'docs/evidence/P03-01/native-parser-cases.jsonl'); Name = 'p03-native-parser-cases.jsonl' },
      @{ Source = (Join-Path $destination 'test-results/P03-01-native-parser.json'); Name = 'p03-native-parser-results.json' }
    )) {
      if (Test-Path -LiteralPath $artifact.Source -PathType Leaf) {
        Copy-Item `
          -LiteralPath $artifact.Source `
          -Destination (Join-Path $evidenceDirectory $artifact.Name) `
          -Force
      }
    }
    # Preserve only the seven synthetic acceptance PDFs before the private kit is discarded.
    $officePdfSource = Join-Path $destination 'test-results/P00-03-office'
    $officePdfDestination = Join-Path $evidenceDirectory 'office-pdfs'
    foreach ($pdfName in @('sample-docx', 'sample-xlsx', 'sample-pptx', 'macro-blocked', 'macro-control', 'link-blocked', 'link-control')) {
      $sourcePdf = Join-Path $officePdfSource ($pdfName + '.pdf')
      if (Test-Path -LiteralPath $sourcePdf -PathType Leaf) {
        if ((Get-Item -LiteralPath $sourcePdf).Length -gt 5MB) { throw 'Synthetic Office acceptance PDF exceeds the archive limit.' }
        New-Item -ItemType Directory -Path $officePdfDestination -Force | Out-Null
        Copy-Item -LiteralPath $sourcePdf -Destination (Join-Path $officePdfDestination ($pdfName + '.pdf')) -Force
      }
    }
    if (Test-Path -LiteralPath $stdoutPath) {
      Copy-Item `
        -LiteralPath $stdoutPath `
        -Destination (Join-Path $evidenceDirectory 'launcher-stdout.log') `
        -Force
    }
    if (Test-Path -LiteralPath $stderrPath) {
      Copy-Item `
        -LiteralPath $stderrPath `
        -Destination (Join-Path $evidenceDirectory 'launcher-stderr.log') `
        -Force
    }
    if (Test-Path -LiteralPath $testDataPath -PathType Container) {
      $testDataRoot = [System.IO.Path]::GetFullPath($testDataPath).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
      $helperLogDestination = Join-Path $evidenceDirectory 'standard-user-helper-logs'
      $copiedLogBytes = 0
      $maximumLogBytes = 10MB
      $maximumLogFileBytes = 512KB
      foreach ($testRoot in Get-ChildItem -LiteralPath $testDataPath -Directory) {
        foreach ($logDirectory in Get-ChildItem -LiteralPath $testRoot.FullName -Directory -Filter 'helper-logs-*') {
          $resolvedLogDirectory = [System.IO.Path]::GetFullPath($logDirectory.FullName)
          if (!$resolvedLogDirectory.StartsWith($testDataRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
          }
          foreach ($logName in @('stdout.log', 'stderr.log')) {
            $sourceLog = Join-Path $resolvedLogDirectory $logName
            if (!(Test-Path -LiteralPath $sourceLog -PathType Leaf)) { continue }
            $logLength = (Get-Item -LiteralPath $sourceLog).Length
            if ($logLength -gt $maximumLogFileBytes -or $copiedLogBytes + $logLength -gt $maximumLogBytes) {
              continue
            }
            $logDestination = Join-Path $helperLogDestination $logDirectory.Name
            New-Item -ItemType Directory -Path $logDestination -Force | Out-Null
            Copy-Item -LiteralPath $sourceLog -Destination (Join-Path $logDestination $logName) -Force
            $copiedLogBytes += $logLength
          }
        }
      }
    }
  }
  finally {
    if ($userCreated) { Remove-LocalUser -Name $accountName }
  }
}
