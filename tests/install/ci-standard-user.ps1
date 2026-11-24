param([Parameter(Mandatory=$true)][string]$Packages)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or !$env:RUNNER_TEMP -or !$env:GITHUB_WORKSPACE) {
  throw 'This harness provisions a test user only on the ephemeral GitHub Actions runner.'
}

$name = 'tksetup-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$directory = Join-Path $env:RUNNER_TEMP $name
$results = Join-Path $directory 'results'
$packagesDir = Join-Path $directory 'packages'
$evidence = Join-Path $env:GITHUB_WORKSPACE 'ci-evidence/P11-02'
$null = New-Item -ItemType Directory -Force -Path $directory,$results,$packagesDir,$evidence
$identity = "$env:COMPUTERNAME\$name"
$pw = ConvertTo-SecureString ('Aa9!' + [Guid]::NewGuid().ToString('N')) -AsPlainText -Force
$user = New-LocalUser -Name $name -Password $pw -Description 'TapKit P11-02 ephemeral installer test'
try {
  Copy-Item -Path (Join-Path $Packages '*') -Destination $packagesDir
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verify.ps1'),(Join-Path $PSScriptRoot 'profile.cjs') -Destination $directory
  & icacls.exe $directory /grant ($identity + ':(OI)(CI)(RX)') /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not grant the test user read access.' }
  & icacls.exe $results /grant ($identity + ':(OI)(CI)(M)') /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not grant the test user evidence access.' }

  $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Packages "{1}" -Environment CI -Report "{2}"' -f (
    Join-Path $directory 'verify.ps1'),$packagesDir,(Join-Path $results 'installer-tests.json')
  $stdout = Join-Path $evidence 'stdout.log'
  $stderr = Join-Path $evidence 'stderr.log'
  $options = @{
    FilePath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    ArgumentList = $arguments
    Credential = [System.Management.Automation.PSCredential]::new($identity,$pw)
    LoadUserProfile = $true
    UseNewEnvironment = $true
    WorkingDirectory = $directory
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $stdout
    RedirectStandardError = $stderr
    PassThru = $true
    Wait = $true
  }
  $process = Start-Process @options
  Get-Content -LiteralPath $stdout | Write-Host
  Get-Content -LiteralPath $stderr | Write-Host
  $result = Join-Path $results 'installer-tests.json'
  if (Test-Path -LiteralPath $result) { Copy-Item -LiteralPath $result -Destination $evidence }
  if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $result)) {
    throw "Windows installer acceptance exited $($process.ExitCode)."
  }
} finally {
  Remove-LocalUser -SID $user.SID
}
