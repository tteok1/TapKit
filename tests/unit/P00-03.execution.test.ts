import { expect, test } from 'vitest';
import { ExecutionLimitsSchema, unavailableExecution } from '../../packages/contracts/src';
import {
  requireExecutionCapability,
  readExecutionCapabilities,
} from '../../packages/tools/src/execution';
test('P00-03 missing native evidence fails closed', async () => {
  const result = await readExecutionCapabilities('.test-data/missing');
  expect(result.nativeExecution.status).toBe('failed');
  expect(() =>
    requireExecutionCapability(unavailableExecution('PROBE_REQUIRED'), 'nativeExecution'),
  ).toThrow('PROBE_REQUIRED');
});
test('P00-03 resource limits cannot be widened past shared hard limits', () => {
  for (const value of [
    { memoryBytes: 2147483649 },
    { processLimit: 33 },
    { timeoutMs: 120001 },
    { outputBytes: 4194305 },
  ])
    expect(ExecutionLimitsSchema.safeParse(value).success).toBe(false);
});
