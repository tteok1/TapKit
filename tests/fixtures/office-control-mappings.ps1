param(
  [ValidateSet('create', 'remove')][string]$Operation,
  [string]$RuntimeRoot,
  [string]$Workspace,
  [string]$InputRoot,
  [Parameter(Mandatory=$true)][string]$Journal
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TapKitOfficeControlMappings {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool DefineDosDevice(uint flags, string drive, string target);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint QueryDosDevice(string drive, StringBuilder target, int size);
}
'@
function Read-Targets([string]$drive) {
  $buffer = [System.Text.StringBuilder]::new(32768)
  $length = [TapKitOfficeControlMappings]::QueryDosDevice($drive, $buffer, $buffer.Capacity)
  if (!$length) {
    $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($code -in @(2,3)) { return @() }
    throw "QueryDosDevice failed: $code"
  }
  return @($buffer.ToString().Split([char]0, [StringSplitOptions]::RemoveEmptyEntries))
}
$journalPath = [IO.Path]::GetFullPath($Journal)
$testPrefix = [IO.Path]::GetFullPath((Join-Path $PWD '.test-data')).TrimEnd('\') + '\'
if (!$journalPath.StartsWith($testPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Test mapping journal must be inside the private test directory.'
}
$mutex = [Threading.Mutex]::new($false, 'Local\TapKit.OfficeAllocation.v1')
$locked = $false
try {
  try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (!$locked) { throw 'Mapping allocation timeout.' }
  if ($Operation -eq 'create') {
    if (Test-Path -LiteralPath $journalPath) { throw 'Test mapping journal already exists.' }
    $roots = @($RuntimeRoot, $Workspace, $InputRoot)
    $mappings = @()
    foreach ($letter in 'RSTUVWXYZQPONMLKJIHGFE'.ToCharArray()) {
      $drive = "$($letter):"
      if ((Read-Targets $drive).Count) { continue }
      $resolvedRoot = (Get-Item -LiteralPath $roots[$mappings.Count]).FullName
      if ($resolvedRoot -notmatch '^[A-Za-z]:\\' -or (Get-Item -LiteralPath $resolvedRoot).LinkType) {
        throw 'Only local, non-reparse test roots may be mapped.'
      }
      $mappings += @{ drive=$drive; target=('\??\' + $resolvedRoot) }
      if ($mappings.Count -eq 3) { break }
    }
    if ($mappings.Count -ne 3) { throw 'Test mapping drives exhausted.' }
    $mappings | ConvertTo-Json | Set-Content -LiteralPath $journalPath -Encoding utf8
    foreach ($mapping in $mappings) {
      if (![TapKitOfficeControlMappings]::DefineDosDevice(9, $mapping.drive, $mapping.target)) {
        throw 'Test mapping creation failed; retained journal for exact cleanup.'
      }
    }
    $mappings | ConvertTo-Json -Compress
  } else {
    $mappings = @(Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json)
    if ($mappings.Count -ne 3) { throw 'Invalid test mapping journal.' }
    foreach ($mapping in $mappings) {
      if ($mapping.drive -notmatch '^[E-Z]:$' -or $mapping.target -notmatch '^\\\?\?\\[A-Za-z]:\\') {
        throw 'Invalid test mapping record.'
      }
      $targets = @(Read-Targets $mapping.drive)
      if (!$targets.Count) { continue }
      if ($targets[0] -ne $mapping.target) { throw 'Mapping identity changed; refusing removal.' }
      if (![TapKitOfficeControlMappings]::DefineDosDevice(15, $mapping.drive, $mapping.target)) {
        throw 'Exact test mapping cleanup failed.'
      }
      if ((Read-Targets $mapping.drive) -contains $mapping.target) { throw 'Test mapping retained.' }
    }
    Remove-Item -LiteralPath $journalPath
  }
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
