param([Parameter(Mandatory = $true)][int]$RootProcessId)

$ErrorActionPreference = 'Stop'
while (Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue) {
    $processes = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, WorkingSetSize
    if (!($processes | Where-Object ProcessId -eq $RootProcessId)) { break }
    $descendants = [System.Collections.Generic.HashSet[uint32]]::new()
    $null = $descendants.Add($RootProcessId)
    do {
        $added = $false
        foreach ($process in $processes) {
            if ($descendants.Contains($process.ParentProcessId) -and $descendants.Add($process.ProcessId)) {
                $added = $true
            }
        }
    } while ($added)
    $owned = @($processes | Where-Object { $descendants.Contains($_.ProcessId) })
    $helperCount = @($owned | Where-Object Name -eq 'tapkit-windows-helper.exe').Count
    @{
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        totalBytes = ($owned | Measure-Object -Property WorkingSetSize -Sum).Sum
        processCount = $owned.Count
        nativeHelpers = $helperCount
    } | ConvertTo-Json -Compress
    Start-Sleep -Milliseconds 250
}
