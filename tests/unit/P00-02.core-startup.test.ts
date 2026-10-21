import { expect, test } from 'vitest';
import {
  coreStartupTimeout,
  readCoreStartupTimeout,
} from '../../apps/desktop/src/main/core-startup';

const failed = { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason: 'PROBE_REQUIRED' };
const report = {
  executionPolicy: 'appcontainer-lok-v1',
  fingerprint: 'a'.repeat(64),
  capabilities: { nativeExecution: failed, officeRender: failed, terminal: failed },
};

test('P00-02 ordinary unavailable-runtime startup keeps its original 15 second watchdog', () => {
  expect(coreStartupTimeout(report)).toBe(15_000);
  expect(readCoreStartupTimeout('.test-data/missing-startup-report')).toBe(15_000);
});
test('P00-02 complete runtime verification receives a bounded startup allowance beyond measured cold IO', () => {
  const time = coreStartupTimeout({
    ...report,
    capabilities: { ...report.capabilities, nativeExecution: { status: 'available' } },
  });
  expect(time).toBe(120_000);
  expect(time).toBeGreaterThan(67_215);
});
test('P00-02 malformed or obsolete reports cannot select the extended startup allowance', () => {
  for (const input of [
    undefined,
    null,
    {},
    { ...report, executionPolicy: 'host-process' },
    { ...report, fingerprint: 'bad' },
    { ...report, capabilities: { nativeExecution: { status: 'available' } } },
  ])
    expect(coreStartupTimeout(input)).toBe(15_000);
});
