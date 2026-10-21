import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { executionFingerprint } from '../../scripts/runtime-inventory.mjs';
import { readExecutionIdentity } from '../../scripts/execution-verification.mjs';
import { readExecutionCapabilities } from '../../packages/tools/src/execution';

vi.mock('../../scripts/runtime-inventory.mjs', () => ({ executionFingerprint: vi.fn() }));
vi.mock('../../scripts/execution-verification.mjs', async (original) => ({
  ...(await original<typeof import('../../scripts/execution-verification.mjs')>()),
  readExecutionIdentity: vi.fn(),
}));
const identity = {
  userSidHash: 'a'.repeat(64),
  integritySid: 'S-1-16-8192',
  administratorsGroup: true,
};
const capabilities = {
  nativeExecution: { status: 'available' },
  officeRender: { status: 'available' },
  terminal: { status: 'available' },
};
const report = () => ({
  schemaVersion: 2,
  executionPolicy: 'appcontainer-lok-v1',
  fingerprint: 'b'.repeat(64),
  standardUser: false,
  verification: { scope: 'current-user', identity },
  exitCode: 0,
  tests: { total: 22, passed: 22, failed: 0, pending: 0 },
  missingCases: [],
  capabilities,
});
beforeEach(() => {
  vi.mocked(executionFingerprint).mockReset().mockResolvedValue('b'.repeat(64));
  vi.mocked(readExecutionIdentity).mockReset().mockReturnValue(identity);
});
async function load(value: unknown) {
  const base = await mkdtemp(resolve('.test-data/P00-03 scoped report '));
  await mkdir(join(base, 'resources/runtime'), { recursive: true });
  await writeFile(join(base, 'resources/runtime/capabilities.json'), JSON.stringify(value));
  return readExecutionCapabilities(base);
}
test('P00-03 Core consumes a real-shaped successful current-account report without standard-user approval', async () => {
  expect(await load(report())).toEqual(capabilities);
});
test('P00-03 another account or changed token cannot reuse the current-account capability report', async () => {
  vi.mocked(readExecutionIdentity).mockReturnValue({ ...identity, userSidHash: 'c'.repeat(64) });
  expect((await load(report())).nativeExecution).toMatchObject({
    status: 'failed',
    reason: 'PROBE_ACCOUNT_CHANGED',
  });
  vi.mocked(readExecutionIdentity).mockReturnValue({ ...identity, integritySid: 'S-1-16-12288' });
  expect((await load(report())).nativeExecution).toMatchObject({
    status: 'failed',
    reason: 'PROBE_TOKEN_CHANGED',
  });
});
test('P00-03 account binding does not bypass stale runtime policy or failed native evidence', async () => {
  vi.mocked(executionFingerprint).mockResolvedValue('d'.repeat(64));
  expect((await load(report())).nativeExecution).toMatchObject({
    status: 'failed',
    reason: 'PROBE_STALE',
  });
  vi.mocked(executionFingerprint).mockResolvedValue('b'.repeat(64));
  expect(
    (await load({ ...report(), executionPolicy: 'host-process' })).nativeExecution,
  ).toMatchObject({ status: 'failed', reason: 'EXECUTION_POLICY_CHANGED' });
  expect((await load({ ...report(), exitCode: 1 })).nativeExecution).toMatchObject({
    status: 'failed',
    reason: 'NATIVE_ACCEPTANCE_INCOMPLETE',
  });
});
test('P00-03 failed capability reports still deny execution without inspecting the account or hashing runtimes', async () => {
  const failed = {
    status: 'failed',
    code: 'SANDBOX_UNAVAILABLE',
    reason: 'NATIVE_ACCEPTANCE_FAILED',
  };
  expect(
    await load({
      executionPolicy: 'appcontainer-lok-v1',
      capabilities: { nativeExecution: failed, officeRender: failed, terminal: failed },
    }),
  ).toEqual({ nativeExecution: failed, officeRender: failed, terminal: failed });
  expect(executionFingerprint).not.toHaveBeenCalled();
  expect(readExecutionIdentity).not.toHaveBeenCalled();
});
