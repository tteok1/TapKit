import { test, expect } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore, BlobStore, FileRepository, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ContextService } from '../../packages/core/src/context-service';
import { ChatService } from '../../packages/core/src/chat-service';
import {
  DEFAULT_MODEL_PREFERENCES,
  DescriptorSchema,
  ContextViewSchema,
} from '../../packages/contracts/src';
import type { RoutingInput, RoutedEvent } from '../../packages/providers/src/routing/router';
const req = (command: string, payload: unknown, expectedRevision?: number) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
  ...(expectedRevision === undefined ? {} : { expectedRevision }),
});
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P04-02 synthetic ')),
    store = await openStore(dir),
    blobs = new BlobStore(store),
    core = new CoreService(store);
  const selection = { accountId: newId(), modelId: 'synthetic' },
    descriptor = DescriptorSchema.parse({
      accountId: selection.accountId,
      providerId: 'openai-compatible',
      modelId: selection.modelId,
      displayName: 'synthetic',
      contextWindow: 64000,
      maxOutput: 8192,
      toolCalls: 'documented',
      verification: 'probed',
      accountLabel: 'fixture',
      status: 'ready',
      reasoningLevels: ['off'],
      modalities: ['text'],
      parallelTools: 'unknown',
      jsonOutput: 'unknown',
      scenario: 'fixture',
      price: null,
      quotaRemaining: null,
      quotaResetAt: null,
    });
  const inputs: RoutingInput[] = [];
  const chat = new ChatService(store, blobs, {
    catalog: async () => [descriptor],
    effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream(input: RoutingInput): AsyncIterable<RoutedEvent> {
        inputs.push(input);
        const attemptId = newId();
        yield { type: 'attempt', attemptId, model: selection, attemptNo: 1 };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'text_delta', blockId: 'text', text: '已收到合成目标。' },
        };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
        };
      },
    },
  });
  const create = (projectId?: string) => {
    const r = core.dispatch(
      req('sessions.create', {
        title: '合成上下文',
        mode: 'chat',
        ...(projectId ? { projectId } : {}),
      }),
    );
    if (!r.ok) throw new Error(r.error.code);
    return (r.data as { entityId: string }).entityId;
  };
  const add = (sid: string, role: 'user' | 'assistant', text: string) =>
    chat.insertMessage(chat.contexts.session(sid) as never, role, text, 'final', null);
  return { dir, store, blobs, core, chat, create, add, inputs };
}
test('P04-02 T12 durable three compactions, correction CAS, next taskVersion and selected continuation', async () => {
  const f = await fixture();
  try {
    const sid = f.create();
    f.add(sid, 'user', '编号TK-123；预算￥500；期限2026-10-31；不要创建PR；不得合入main。');
    for (let i = 0; i < 3; i++) {
      f.add(sid, 'assistant', '中文背景资料'.repeat(5000));
      const r = await f.chat.dispatch(req('context.compact', { sessionId: sid }));
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(r.error.code);
      const view = ContextViewSchema.parse(r.data);
      expect(JSON.stringify(view)).toContain('不得合入main');
    }
    const before = f.chat.contexts.view(sid).checkpoint!;
    const stale = await f.chat.dispatch(
      req(
        'context.correct',
        { sessionId: sid, checkpointId: before.id, text: '仅允许只读。' },
        999,
      ),
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const corrected = await f.chat.dispatch(
      req(
        'context.correct',
        { sessionId: sid, checkpointId: before.id, text: '最新目标：只检查A-999，不得发布。' },
        before.revision,
      ),
    );
    expect(corrected.ok).toBe(true);
    const cp = f.chat.contexts.view(sid).checkpoint!;
    expect(cp.corrected).toBe(true);
    expect(cp.state.goal[0]!.text).toBe('最新目标：只检查A-999，不得发布。');
    const target = f.create();
    expect(
      (
        await f.chat.dispatch(
          req('context.continue', { sessionId: target, checkpointId: cp.id, fields: ['goal'] }),
        )
      ).ok,
    ).toBe(true);
    const background = f.chat.contexts.background(target);
    expect(JSON.stringify(background)).toContain('A-999');
    expect(JSON.stringify(background)).not.toContain('￥500');
    const sent = await f.chat.dispatch(
      req('messages.send', {
        sessionId: sid,
        clientMessageId: newId(),
        text: '现在继续',
        attachments: [],
        mode: 'chat',
      }),
    );
    expect(sent.ok).toBe(true);
    const run = f.store.db
      .prepare(
        'SELECT task_version,task_id FROM runs WHERE session_id=? ORDER BY rowid DESC LIMIT 1',
      )
      .get(sid) as { task_version: number; task_id: string };
    expect(run.task_version).toBe(2);
    expect(
      f.store.db.prepare('SELECT current_version FROM tasks WHERE id=?').get(run.task_id),
    ).toMatchObject({ current_version: 2 });
    f.chat.start();
    await expect
      .poll(() => f.store.db.prepare('SELECT status FROM runs WHERE task_id=?').get(run.task_id))
      .toMatchObject({ status: 'completed' });
    expect(f.store.db.prepare('SELECT count(*) n FROM context_snapshots').get()).toMatchObject({
      n: 1,
    });
    await f.chat.stop();
    f.store.close();
    const reopened = await openStore(f.dir);
    try {
      const contexts = new ContextService(reopened);
      expect(contexts.background(target)).toEqual(background);
      expect(reopened.db.pragma('user_version', { simple: true })).toBe(14);
    } finally {
      reopened.close();
    }
  } finally {
    await f.chat.stop();
    if (f.store.db.open) f.store.close();
  }
});
test('P04-02 cache hit cannot bypass project revocation, source deletion or project isolation', async () => {
  const f = await fixture();
  try {
    const sid = f.create();
    const message = f.add(sid, 'user', '私密事实 ID-P04-02');
    const cp = f.chat.contexts.compact(sid);
    expect(f.chat.contexts.state(cp.id, sid).goal[0]!.text).toContain('私密');
    expect(f.chat.contexts.state(cp.id, sid).goal).toHaveLength(1);
    expect(f.chat.contexts.cache.hits).toBeGreaterThan(0);
    const p = f.core.dispatch(req('projects.create', { name: '隔离合成' }));
    if (!p.ok) throw new Error();
    const projectId = (p.data as { entityId: string }).entityId;
    const target = f.create(projectId);
    expect(() => f.chat.contexts.seed(target, cp.id, ['goal'])).toThrow('PERMISSION_DENIED');
    // Any permission/source version change fences an existing cached summary.
    expect(() => f.chat.contexts.state(cp.id, sid)).toThrow('CONFLICT');
    const fresh = f.chat.contexts.compact(sid);
    f.store.db.prepare('UPDATE messages SET deleted_at=1 WHERE id=?').run(message);
    expect(() => f.chat.contexts.state(fresh.id, sid)).toThrow('CONFLICT');
  } finally {
    await f.chat.stop();
    f.store.close();
  }
});
test('P04-02 pending approved ledger references survive restart and block migration to another session', async () => {
  const f = await fixture();
  try {
    const sid = f.create(),
      mid = f.add(sid, 'user', '只批准审批ID AP-123。'),
      rid = f.store.db.transaction(() =>
        f.chat.createRun(f.chat.contexts.session(sid) as never, mid, null),
      )(),
      toolId = newId(),
      approvalId = newId();
    f.store.db
      .prepare(
        "INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,approval_id,status,side_effect) VALUES(?,?,?,?,?,1,'pending-123','files.read','1','{}',?,?,?,?,'approved','none')",
      )
      .run(
        toolId,
        f.store.profileId,
        1,
        1,
        rid,
        createHash('sha256').update('{}').digest('hex'),
        'b'.repeat(64),
        newId(),
        approvalId,
      );
    const cp = f.chat.contexts.compact(sid, rid),
      state = f.chat.contexts.state(cp.id, sid);
    expect(state.execution_refs[0]).toMatchObject({ id: toolId, status: 'approved', approvalId });
    expect(() => f.chat.contexts.seed(f.create(), cp.id, ['goal'])).toThrow('CONFLICT');
    f.store.close();
    const reopened = await openStore(f.dir);
    try {
      expect(new ContextService(reopened).state(cp.id, sid).execution_refs).toEqual(
        state.execution_refs,
      );
    } finally {
      reopened.close();
    }
  } finally {
    if (f.store.db.open) {
      await f.chat.stop();
      f.store.close();
    }
  }
});
test('P04-02 idempotent summary receipts reauthorize; deletion and source scope changes cannot replay cached private data', async () => {
  const f = await fixture();
  try {
    const sid = f.create(),
      mid = f.add(sid, 'user', '必须保留A-991。');
    const request = req('context.compact', { sessionId: sid });
    const first = await f.chat.dispatch(request);
    expect(first.ok).toBe(true);
    expect(await f.chat.dispatch(request)).toEqual(first);
    f.store.db.prepare('UPDATE messages SET deleted_at=1 WHERE id=?').run(mid);
    expect(await f.chat.dispatch(request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    f.store.db.prepare('UPDATE messages SET deleted_at=NULL WHERE id=?').run(mid);
    const cp = f.chat.contexts.compact(sid);
    f.store.db
      .prepare('UPDATE sessions SET settings_json=? WHERE id=?')
      .run(JSON.stringify({ schemaVersion: 1, projectScope: { projectOnly: true } }), sid);
    expect(() => f.chat.contexts.state(cp.id, sid)).toThrow('PERMISSION_DENIED');
    expect(f.chat.contexts.cache.stats().bytes).toBe(0);
  } finally {
    await f.chat.stop();
    f.store.close();
  }
});
test('P04-02 revoked file-derived assistant content is excluded from newly regenerated checkpoints', async () => {
  const f = await fixture();
  try {
    const project = f.core.dispatch(req('projects.create', { name: '撤权合成' }));
    if (!project.ok) throw new Error();
    const projectId = (project.data as { entityId: string }).entityId,
      sid = f.create(projectId);
    const attached = await f.chat.dispatch(
      req('inputs.attach', {
        sessionId: sid,
        name: 'private.txt',
        bytes: Buffer.from('秘密资料PRIVATE-887').toString('base64'),
      }),
    );
    if (!attached.ok) throw new Error();
    const ref = (attached.data as { ref: { kind: 'file'; fileId: string; versionId: string } }).ref;
    const sent = await f.chat.dispatch(
      req('messages.send', {
        sessionId: sid,
        clientMessageId: newId(),
        text: '读取附件',
        attachments: [ref],
        mode: 'chat',
      }),
    );
    if (!sent.ok) throw new Error();
    const runId = (sent.data as { runId: string }).runId;
    f.chat.insertMessage(
      f.chat.contexts.session(sid) as never,
      'assistant',
      '根据文件：秘密资料PRIVATE-887',
      'final',
      runId,
    );
    const before = f.chat.contexts.compact(sid);
    expect(JSON.stringify(f.chat.contexts.state(before.id, sid))).toContain('PRIVATE-887');
    expect(f.chat.contexts.view(sid).providerCachedTokens).toBeNull();
    new FileRepository(f.store, f.blobs).unlink([ref.fileId], { type: 'session', id: sid });
    expect(() => f.chat.contexts.state(before.id, sid)).toThrow('CONFLICT');
    const after = f.chat.contexts.compact(sid);
    expect(JSON.stringify(f.chat.contexts.state(after.id, sid))).not.toContain('PRIVATE-887');
  } finally {
    await f.chat.stop();
    f.store.close();
  }
});
