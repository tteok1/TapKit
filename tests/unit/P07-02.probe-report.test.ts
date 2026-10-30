import { expect, test } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readCurrentProbeResults } from '../../scripts/runtime-probe-results.mjs';

test('P07-02 a timed-out probe cannot inherit stale, absent or incomplete passing evidence', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P07-02 probe report '));
  const file = join(dir, 'report.json'),
    start = '2026-10-29T00:00:00.000Z';
  expect(await readCurrentProbeResults(file, start)).toBeNull();
  await writeFile(
    file,
    JSON.stringify({ startTime: Date.parse(start) - 1, numTotalTests: 22, numFailedTests: 0 }),
  );
  expect(await readCurrentProbeResults(file, start)).toBeNull();
  await writeFile(file, '{');
  expect(await readCurrentProbeResults(file, start)).toBeNull();
  await writeFile(
    file,
    JSON.stringify({ startTime: Date.parse(start) + 100, numTotalTests: 22, numFailedTests: 0 }),
  );
  expect((await readCurrentProbeResults(file, start))?.numTotalTests).toBe(22);
});
