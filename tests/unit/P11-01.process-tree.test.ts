import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

type ProcessSnapshot = { id: number; parent: number; created: number | null; bytes: number };
function selectTree(processes: ProcessSnapshot[], rootCreated = 100) {
  const script = resolve('tests/fixtures/P11-01-process-tree.ps1').replaceAll("'", "''");
  const output = execFileSync(
    'pwsh.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ErrorActionPreference='Stop'; . '${script}';
       $inputData=[Console]::In.ReadToEnd() | ConvertFrom-Json;
       $snapshot=@($inputData.processes | ForEach-Object {
         [PSCustomObject]@{ProcessId=[uint32]$_.id;ParentProcessId=[uint32]$_.parent;
           CreationDate=$(if ($null -ne $_.created) {[datetime]::new([long]$_.created,[DateTimeKind]::Utc)} else {$null});
           WorkingSetSize=$_.bytes}
       });
       $owned=@(Get-TapKitProcessTree -RootProcessId 100 -RootCreationDate ([datetime]::new([long]$inputData.rootCreated,[DateTimeKind]::Utc)) -Processes $snapshot);
       ConvertTo-Json -Compress -InputObject @($owned | ForEach-Object {$_.ProcessId})`,
    ],
    {
      input: JSON.stringify({ processes, rootCreated }),
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  return JSON.parse(output) as number[];
}

test('P11-01 memory sampler excludes stale parent PIDs without losing real Office descendants', () => {
  const processes = [
    { id: 300, parent: 200, created: 300, bytes: 20 },
    { id: 60, parent: 50, created: 60, bytes: 3_000_000_000 },
    { id: 50, parent: 200, created: 50, bytes: 500_000_000 },
    { id: 100, parent: 60, created: 100, bytes: 10 },
    { id: 200, parent: 100, created: 200, bytes: 15 },
  ];
  expect(selectTree(processes).sort((a, b) => a - b)).toEqual([100, 200, 300]);
});

test('P11-01 memory sampler stops when its root PID has been reused', () => {
  expect(selectTree([{ id: 100, parent: 1, created: 400, bytes: 10 }])).toEqual([]);
});

test('P11-01 memory sampler retains concurrent children with the same creation timestamp', () => {
  expect(
    selectTree([
      { id: 100, parent: 1, created: 100, bytes: 10 },
      { id: 200, parent: 100, created: 100, bytes: 15 },
      { id: 300, parent: 100, created: 100, bytes: 20 },
    ]),
  ).toEqual([100, 200, 300]);
});

test('P11-01 memory sampler rejects missing creation metadata instead of undercounting memory', () => {
  expect(() =>
    selectTree([
      { id: 100, parent: 1, created: 100, bytes: 10 },
      { id: 200, parent: 100, created: null, bytes: 15 },
    ]),
  ).toThrow();
});
