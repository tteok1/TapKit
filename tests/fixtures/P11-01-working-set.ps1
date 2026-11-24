param([Parameter(Mandatory = $true)][int]$RootProcessId)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'P11-01-process-tree.ps1')
$rootCreationDate = $null
while (Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue) {
    $processes = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, WorkingSetSize, CreationDate -OperationTimeoutSec 10)
    $root = $processes | Where-Object ProcessId -eq $RootProcessId
    if (!$root) { break }
    if (!$root.CreationDate) { throw 'Missing root process creation time.' }
    if ($null -eq $rootCreationDate) { $rootCreationDate = $root.CreationDate }
    $owned = @(Get-TapKitProcessTree -RootProcessId $RootProcessId -RootCreationDate $rootCreationDate -Processes $processes)
    if ($owned.Count -eq 0) { break }
    $helperCount = @($owned | Where-Object Name -eq 'tapkit-windows-helper.exe').Count
    @{
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        totalBytes = ($owned | Measure-Object -Property WorkingSetSize -Sum).Sum
        processCount = $owned.Count
        nativeHelpers = $helperCount
        processes = @($owned | ForEach-Object {
            @{ pid = $_.ProcessId; parentPid = $_.ParentProcessId; name = $_.Name;
               createdAt = $_.CreationDate.ToUniversalTime().ToString('o'); workingSetBytes = $_.WorkingSetSize }
        })
    } | ConvertTo-Json -Compress
    Start-Sleep -Milliseconds 250
}
