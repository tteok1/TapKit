import { test, expect } from 'vitest';
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mkdtemp } from '../../scripts/test-temp.mjs';
import { IpcAudit } from '../../apps/desktop/src/main/ipc-audit';
import type { Reply } from '../../packages/contracts/src';
const success = {
  ok: true,
  requestId: 'fixture',
  data: { privateText: 'NEVER_LOG_PAYLOAD' },
} as unknown as Reply;

test('P11-01 IPC audit persists ordered metadata before resolving and excludes payloads', async () => {
  const dir = await mkdtemp(resolve('.test-data/P11-01 audit '));
  const audit = new IpcAudit(dir);
  const writes = Array.from({ length: 20 }, (_, i) =>
    audit.write('request-' + i, 'messages.list', success),
  );
  await Promise.all(writes);
  await audit.flush();
  const text = await readFile(join(dir, 'logs/ipc.jsonl'), 'utf8');
  expect(text).not.toContain('NEVER_LOG_PAYLOAD');
  expect(
    text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  ).toEqual(
    Array.from({ length: 20 }, (_, i) => ({
      requestId: 'request-' + i,
      command: 'messages.list',
      ok: true,
    })),
  );
});

test('P11-01 concurrent audit writes rotate once and retain unrelated files', async () => {
  const dir = await mkdtemp(resolve('.test-data/P11-01 audit '));
  const logs = join(dir, 'logs');
  await mkdir(logs);
  await writeFile(join(logs, 'ipc.jsonl'), 'x'.repeat(1_048_577));
  await writeFile(join(logs, 'ipc-1.jsonl'), 'old');
  await writeFile(join(logs, 'unrelated.txt'), 'retain');
  const audit = new IpcAudit(dir);
  await Promise.all([
    audit.write('a', 'messages.list', success),
    audit.write('b', 'runs.cancel', success),
  ]);
  const files = await readdir(logs);
  expect(files.filter((name) => /^ipc-\d+\.jsonl$/.test(name))).toHaveLength(1);
  expect(files).not.toContain('ipc-1.jsonl');
  expect(files).toContain('unrelated.txt');
  expect((await readFile(join(logs, 'ipc.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(2);
});

test('P11-01 audit failures reach callers and do not poison later writes', async () => {
  const dir = await mkdtemp(resolve('.test-data/P11-01 audit '));
  await writeFile(join(dir, 'logs'), 'blocked');
  const audit = new IpcAudit(dir);
  await expect(audit.write('a', 'messages.list', success)).rejects.toThrow();
  await expect(audit.flush()).rejects.toThrow();
  await unlink(join(dir, 'logs'));
  await audit.write('b', 'messages.list', success);
  await audit.flush();
  expect(JSON.parse((await readFile(join(dir, 'logs/ipc.jsonl'), 'utf8')).trim())).toEqual({
    requestId: 'b',
    command: 'messages.list',
    ok: true,
  });
});
