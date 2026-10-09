param(
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$RunnerPath,
  [Parameter(Mandatory=$true)][string]$RootPath,
  [Parameter(Mandatory=$true)][string]$DataDir,
  [Parameter(Mandatory=$true)][string]$Provider,
  [Parameter(Mandatory=$true)][string]$Account,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedBinding,
  [ValidateSet('full','text-only')][string]$RunMode = 'full'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# Reject quoted/line-broken arguments before constructing the Windows command line.
foreach ($argument in @($RunnerPath, $RootPath, $DataDir, $Provider, $Account)) {
  if ($argument -match '["\r\n]' -or $argument.EndsWith('\')) { throw 'Invalid argument.' }
}
$env:TAPKIT_API_LIVE = '1'
$secureKey = Read-Host 'Enter the API Key for this account (hidden; never sent to Codex)' -AsSecureString
$pointer = [IntPtr]::Zero
$process = $null
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $NodePath
  $start.Arguments = (@($RunnerPath, '--run', $RootPath, $DataDir, $Provider, $Account, $ExpectedBinding, $RunMode) | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $start
  [void]$process.Start()
  $outputTask = $process.StandardOutput.ReadToEndAsync()
  $errorTask = $process.StandardError.ReadToEndAsync()
  $keyBytes = [Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
  try {
    $process.StandardInput.BaseStream.Write($keyBytes, 0, $keyBytes.Length)
  } finally { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
  $process.StandardInput.Close()
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $pointer = [IntPtr]::Zero
  $secureKey.Dispose()
  if (-not $process.WaitForExit(330000)) {
    $process.Kill()
    throw 'P01-02 live timeout; no retry.'
  }
  [Console]::Out.WriteLine($outputTask.GetAwaiter().GetResult())
  $diagnostic = $errorTask.GetAwaiter().GetResult()
  if ($diagnostic) { [Console]::Error.WriteLine($diagnostic) }
  exit $process.ExitCode
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ($process) {
    if (-not $process.HasExited) { $process.Kill() }
    $process.Dispose()
  }
  $secureKey.Dispose()
}
