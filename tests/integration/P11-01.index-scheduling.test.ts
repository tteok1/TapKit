import { expect, test, vi } from 'vitest';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { HybridIndex, type Embedder } from '../../packages/retrieval/src';
import { retrievalFixture } from './P04-01.fixture';

test.each([
  ['cancel', false],
  ['revoke', false],
  ['cancel', true],
  ['revoke', true],
] as const)(
  'P11-01 indexing yields so %s runs before publication with async count=%s',
  async (action, asyncCount) => {
    const f = await retrievalFixture();
    const abort = new AbortController();
    let cancel: ReturnType<typeof setImmediate> | undefined;
    let allowed = true;
    try {
      const file = await f.put(f.project(), '索引资料与聊天并发。'.repeat(600));
      const doc = await f.files.parsed(file.id, { versionId: file.currentVersionId });
      const row = f.store.db
        .prepare('SELECT id,index_version FROM parsed_documents WHERE file_version_id=?')
        .get(file.currentVersionId) as { id: string; index_version: number };
      const embed = vi.fn(async () => new Float32Array([1, 0]));
      const embedder: Embedder = {
        revision: 'P11-01-scheduling-fixture',
        dims: 2,
        count(text) {
          const started = performance.now();
          while (performance.now() - started < 2) {
            /* deterministic CPU work per count */
          }
          return Math.ceil(text.length / 2);
        },
        embed,
      };
      if (asyncCount)
        embedder.countAsync = async (text) => {
          await yieldTurn();
          return embedder.count(text);
        };
      const task = new HybridIndex(f.store, embedder).ensure(
        {
          fileId: file.id,
          versionId: file.currentVersionId,
          indexVersion: row.index_version,
          documentId: row.id,
          document: async () => doc,
        },
        () => {
          if (!allowed) throw new Error('PERMISSION_DENIED');
        },
        abort.signal,
      );
      cancel = setImmediate(() => {
        if (action === 'cancel') abort.abort();
        else allowed = false;
      });
      if (action === 'cancel') await expect(task).rejects.toMatchObject({ name: 'AbortError' });
      else await expect(task).rejects.toThrow('PERMISSION_DENIED');
      expect(embed).not.toHaveBeenCalled();
      expect(f.store.db.prepare('SELECT count(*) n FROM chunks').get()).toEqual({ n: 0 });
    } finally {
      if (cancel) clearImmediate(cancel);
      f.store.close();
    }
  },
);

test.each(['cancel', 'revoke'] as const)(
  'P11-01 retrieval rejects %s during asynchronous evidence token budgeting',
  async (action) => {
    const f = await retrievalFixture();
    const abort = new AbortController();
    let allowed = true,
      armed = false;
    try {
      const file = await f.put(f.project(), '项目验收规则和材料引用');
      const doc = await f.files.parsed(file.id, { versionId: file.currentVersionId });
      const row = f.store.db
        .prepare('SELECT id,index_version FROM parsed_documents WHERE file_version_id=?')
        .get(file.currentVersionId) as { id: string; index_version: number };
      const source = {
        fileId: file.id,
        versionId: file.currentVersionId,
        indexVersion: row.index_version,
        documentId: row.id,
        document: async () => doc,
      };
      const count = vi.fn(async (text: string) => {
        if (armed) {
          if (action === 'cancel') abort.abort();
          else allowed = false;
        }
        return text.length;
      });
      const index = new HybridIndex(f.store, {
        revision: 'P11-01-budget-fixture',
        dims: 2,
        count,
        embed: async () => new Float32Array([1, 0]),
      });
      const scope = () => {
        if (!allowed) throw Error('PERMISSION_DENIED');
      };
      await index.ensure(source, scope);
      count.mockClear();
      armed = true;
      const task = index.search('验收', [source], scope, 8, abort.signal);
      if (action === 'cancel') await expect(task).rejects.toMatchObject({ name: 'AbortError' });
      else await expect(task).rejects.toThrow('PERMISSION_DENIED');
      expect(count).toHaveBeenCalledTimes(1);
    } finally {
      f.store.close();
    }
  },
);
