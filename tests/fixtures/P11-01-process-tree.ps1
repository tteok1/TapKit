function Get-TapKitProcessTree {
    param(
        [Parameter(Mandatory = $true)][uint32]$RootProcessId,
        [Parameter(Mandatory = $true)][datetime]$RootCreationDate,
        [Parameter(Mandatory = $true)][object[]]$Processes
    )

    $byId = @{}
    foreach ($process in $Processes) {
        if ($byId.ContainsKey([uint32]$process.ProcessId)) { throw 'Duplicate process identity in snapshot.' }
        $byId[[uint32]$process.ProcessId] = $process
    }
    $root = $byId[$RootProcessId]
    if (!$root) { return }
    if (!$root.CreationDate) { throw 'Missing root process creation time.' }
    if ($root.CreationDate.ToUniversalTime().Ticks -ne $RootCreationDate.ToUniversalTime().Ticks) { return }

    $descendants = [System.Collections.Generic.HashSet[uint32]]::new()
    $null = $descendants.Add($RootProcessId)
    do {
        $added = $false
        foreach ($process in $Processes) {
            if ($descendants.Contains([uint32]$process.ProcessId) -or !$descendants.Contains([uint32]$process.ParentProcessId)) { continue }
            $parent = $byId[[uint32]$process.ParentProcessId]
            if (!$process.CreationDate) { throw 'Missing descendant process creation time.' }
            # Windows retains the creator PID after exit. A reused PID cannot
            # make a process born earlier a child of its new owner.
            if ($process.CreationDate.ToUniversalTime().Ticks -lt $parent.CreationDate.ToUniversalTime().Ticks) { continue }
            if ($descendants.Add([uint32]$process.ProcessId)) { $added = $true }
        }
    } while ($added)
    $Processes | Where-Object { $descendants.Contains([uint32]$_.ProcessId) }
}
