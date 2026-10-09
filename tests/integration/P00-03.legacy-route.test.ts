import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { HelperRequestSchema } from '../../packages/contracts/src';
import { helperPath } from '../../packages/tools/src/execution';

const root = resolve('.');
function id() {
  const value = randomUUID();
  return value.slice(0, 14) + '7' + value.slice(15);
}

test('P00-03 rejects the superseded account.execute protocol', () => {
  const request = {
    protocolVersion: 1,
    requestId: id(),
    runId: id(),
    leaseEpoch: 1,
    operation: 'account.execute',
    payload: {
      runtimeRoot: 'D:\\runtime',
      executable: 'D:\\runtime\\node.exe',
      inputRoot: 'D:\\input',
      workspace: 'D:\\workspace',
      args: [],
      timeoutMs: 1000,
      memoryBytes: 2 * 1024 ** 3,
      processLimit: 4,
      outputBytes: 1024,
      terminal: false,
    },
  };
  expect(HelperRequestSchema.safeParse(request).success).toBe(false);
  const helper = spawnSync(helperPath(root), [], {
    input: JSON.stringify(request) + '\n',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (helper.error) {
    throw new Error(`P00-03 native helper could not start: ${helper.error.message}`);
  }
  expect(helper.status).toBe(2);
  const events = helper.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    protocolVersion: 1,
    requestId: request.requestId,
    runId: request.runId,
    leaseEpoch: request.leaseEpoch,
    event: 'failed',
    data: { code: 'VALIDATION_ERROR', stage: 'protocol' },
  });
});
