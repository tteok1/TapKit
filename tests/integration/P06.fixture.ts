import { mkdtemp } from '../../scripts/test-temp.mjs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect } from 'vitest';
import { openStore, BlobStore, FileRepository, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { WorkService, type WorkDriver } from '../../packages/core/src/work-service';
import { WorkArtifacts } from '../../packages/core/src/work-artifacts';
import { WorkToolGateway } from '../../packages/core/src/work-gateway';
import { WorkViewSchema } from '../../packages/contracts/src';
export async function fixture(
  driver: WorkDriver = async () => ({
    text: '成果已生成',
    calls: [{ tool: 'artifact.write', name: '结果.md', content: '# 结果\n可验证正文' }],
    finished: true,
  }),
) {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P06-工作 ')),
    store = await openStore(dir),
    blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    core = new CoreService(store),
    artifacts = new WorkArtifacts(files, blobs),
    gateway = new WorkToolGateway(artifacts),
    work = new WorkService(store, driver, gateway, async () => {});
  const reply = core.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'sessions.create',
    payload: { mode: 'work', title: 'P06 fixture' },
  });
  if (!reply.ok || !('entityId' in reply.data)) throw Error('session');
  const sessionId = reply.data.entityId;
  const send = (
    command: string,
    payload: unknown,
    expectedRevision?: number,
    requestId = newId(),
  ) =>
    work.dispatch({
      protocolVersion: 1,
      requestId,
      command,
      payload,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    });
  const create = async (extra: Record<string, unknown> = {}) => {
    const reply = await send('runs.create', { sessionId, goal: 'P06 可验证任务', ...extra });
    expect(reply.ok).toBe(true);
    if (!reply.ok) throw Error(reply.error.code);
    return WorkViewSchema.parse('work' in reply.data ? reply.data.work : null);
  };
  return {
    dir,
    store,
    blobs,
    files,
    core,
    work,
    artifacts,
    gateway,
    sessionId,
    send,
    create,
    close: async () => {
      await work.stop();
      store.close();
    },
  };
}
export async function until(fn: () => boolean) {
  const deadline = performance.now() + 5000;
  while (!fn()) {
    if (performance.now() > deadline) throw Error('condition timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
