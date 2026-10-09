import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openStore, BlobStore, newId, type Store } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ChatService } from '../../packages/core/src/chat-service';
import {
  DEFAULT_MODEL_PREFERENCES,
  DescriptorSchema,
  ChatSnapshotSchema,
  ChatSendViewSchema,
  ChatMaterialSchema,
  ChatDraftViewSchema,
  CreatedEntitySchema,
  type Reply,
} from '../../packages/contracts/src';
import type { RoutingInput, RoutedEvent } from '../../packages/providers/src/routing/router';
const services: ChatService[] = [],
  stores: Store[] = [];
afterEach(async () => {
  for (const c of services.splice(0)) await c.stop();
  for (const s of stores.splice(0)) if (s.db.open) s.close();
});
const req = (command: string, payload: unknown, expectedRevision?: number) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
  ...(expectedRevision === undefined ? {} : { expectedRevision }),
});
const data = (r: Reply) => {
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type Script = (n: number, input: RoutingInput, signal: AbortSignal) => AsyncIterable<RoutedEvent>;
async function fresh(script?: Script, start = true) {
  await mkdir('.test-data', { recursive: true });
  const store = await openStore(await mkdtemp(resolve('.test-data', 'P02-02 fixture ')));
  stores.push(store);
  const account = newId(),
    selection = { accountId: account, modelId: 'fixture-model' };
  const descriptor = DescriptorSchema.parse({
    accountId: account,
    providerId: 'openai-compatible',
    modelId: 'fixture-model',
    displayName: 'fixture',
    contextWindow: 128000,
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
  let calls = 0;
  const model = {
    catalog: async () => [descriptor],
    effective: () => ({
      values: structuredClone(DEFAULT_MODEL_PREFERENCES),
      scope: 'profile' as const,
    }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream(input: RoutingInput, signal: AbortSignal): AsyncIterable<RoutedEvent> {
        inputs.push(structuredClone(input));
        const n = ++calls;
        if (script) {
          yield* script(n, input, signal);
          return;
        }
        const attemptId = newId();
        yield { type: 'attempt', attemptId, model: selection, attemptNo: 1 };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'text_delta', blockId: 'text', text: '已确认中文回答' },
        };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
        };
      },
    },
  };
  const chat = new ChatService(store, new BlobStore(store), model);
  services.push(chat);
  if (start) chat.start();
  const core = new CoreService(store);
  const session = CreatedEntitySchema.parse(
    data(core.dispatch(req('sessions.create', { mode: 'chat', title: 'fixture chat' }))),
  ).entityId;
  const send = async (text = '你好', extra: Record<string, unknown> = {}) =>
    ChatSendViewSchema.parse(
      data(
        await chat.dispatch(
          req('messages.send', {
            sessionId: session,
            text,
            attachments: [],
            clientMessageId: newId(),
            mode: 'chat',
            ...extra,
          }),
        ),
      ),
    );
  const snapshot = async () =>
    ChatSnapshotSchema.parse(
      data(await chat.dispatch(req('messages.list', { sessionId: session }))),
    );
  return { store, chat, core, session, send, snapshot, inputs, selection };
}
async function settled(f: Awaited<ReturnType<typeof fresh>>) {
  await expect
    .poll(async () => (await f.snapshot()).run?.status, { timeout: 4000 })
    .toMatch(/completed|partial|cancelled|budget_stopped/);
  return f.snapshot();
}
describe('P02-02 durable chat', () => {
  it('T13 steer shares the root active-time cap instead of receiving a fresh five minutes', async () => {
    const f = await fresh(async function* (n, _input, signal) {
      const attemptId = newId();
      yield {
        type: 'attempt',
        attemptId,
        model: { accountId: newId(), modelId: 'fixture-model' },
        attemptNo: 1,
      };
      if (n === 1)
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      signal.throwIfAborted();
      yield {
        type: 'model.event',
        attemptId,
        event: { type: 'text_delta', blockId: 'text', text: '不应越过预算' },
      };
      yield {
        type: 'model.event',
        attemptId,
        event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
      };
    });
    const first = await f.send();
    await expect.poll(() => f.inputs.length).toBe(1);
    f.store.db
      .prepare('UPDATE runs SET started_at=? WHERE id=?')
      .run(f.store.now() - 300001, first.runId);
    await f.send('补充', { delivery: 'steer' });
    await expect.poll(async () => (await f.snapshot()).run?.status).toBe('budget_stopped');
    expect(f.inputs).toHaveLength(1);
  });
  it('T05 tool and model limits stop loops, retain confirmed turns, and leave no pending tools', async () => {
    for (const perRound of [1, 2]) {
      const f = await fresh(async function* (n) {
        const attemptId = newId();
        yield {
          type: 'attempt',
          attemptId,
          model: { accountId: newId(), modelId: 'fixture-model' },
          attemptNo: 1,
        };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'text_delta', blockId: 'text', text: '预算轮次' + n },
        };
        for (let i = 0; i < perRound; i++)
          yield {
            type: 'model.event',
            attemptId,
            event: {
              type: 'tool_end',
              callId: newId(),
              name: 'history.search',
              arguments: { query: '预算' },
            },
          };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'finish', reason: 'tool_calls', nativeStateRef: '' },
        };
      });
      await f.send();
      const state = await settled(f);
      expect(state.run?.status).toBe('budget_stopped');
      expect(state.run!.calls).toBeLessThanOrEqual(8);
      expect(state.run!.tools).toBeLessThanOrEqual(12);
      expect(
        f.store.db
          .prepare("SELECT count(*) n FROM tool_calls WHERE status IN ('pending','dispatched')")
          .get(),
      ).toEqual({ n: 0 });
    }
  });
  it('T02 fallback retains the interrupted provider separately and keeps its text out of subsequent canonical context', async () => {
    const f = await fresh(async function* (n) {
      const a = newId(),
        model = { accountId: newId(), modelId: 'fallback-model' };
      yield { type: 'attempt', attemptId: a, model, attemptNo: 1 };
      if (n === 1) {
        yield {
          type: 'model.event',
          attemptId: a,
          event: { type: 'text_delta', blockId: 'text', text: '旧提供方片段' },
        };
        const b = newId();
        yield {
          type: 'attempt',
          attemptId: b,
          model: { ...model, modelId: 'new-model' },
          attemptNo: 2,
        };
        yield {
          type: 'model.event',
          attemptId: b,
          event: { type: 'text_delta', blockId: 'text', text: '完整新答案' },
        };
        yield {
          type: 'model.event',
          attemptId: b,
          event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
        };
      } else {
        yield {
          type: 'model.event',
          attemptId: a,
          event: { type: 'text_delta', blockId: 'text', text: '后续' },
        };
        yield {
          type: 'model.event',
          attemptId: a,
          event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
        };
      }
    });
    await f.send();
    let state = await settled(f);
    expect(
      state.messages.some((m) => m.status === 'interrupted' && m.text === '旧提供方片段'),
    ).toBe(true);
    expect(state.messages.at(-1)?.model?.modelId).toBe('new-model');
    await f.send('后续问题');
    state = await settled(f);
    expect(
      f.inputs[1]?.request.messages.some(
        (m) => m.role === 'assistant' && m.text === '旧提供方片段',
      ),
    ).toBe(false);
    expect(
      f.inputs[1]?.request.messages.some((m) => m.role === 'assistant' && m.text === '完整新答案'),
    ).toBe(true);
  });
  it('T05 one accepted message survives receipt expiry, repeated clicks and changed transport IDs; changed payload conflicts', async () => {
    const f = await fresh(undefined, false),
      client = newId();
    const payload = {
      sessionId: f.session,
      text: '同一问题',
      attachments: [],
      clientMessageId: client,
      mode: 'chat',
    };
    const first = ChatSendViewSchema.parse(
      data(await f.chat.dispatch(req('messages.send', payload))),
    );
    const again = ChatSendViewSchema.parse(
      data(await f.chat.dispatch(req('messages.send', payload))),
    );
    expect(again).toEqual(first);
    f.store.db.prepare('DELETE FROM request_receipts').run();
    expect(
      ChatSendViewSchema.parse(data(await f.chat.dispatch(req('messages.send', payload)))),
    ).toEqual(first);
    expect(
      await f.chat.dispatch(req('messages.send', { ...payload, text: '不同内容' })),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(f.store.db.prepare("SELECT count(*) n FROM messages WHERE role='user'").get()).toEqual({
      n: 1,
    });
    expect(f.store.db.prepare('SELECT count(*) n FROM runs').get()).toEqual({ n: 1 });
    const events = f.store.replay(0, 100).items;
    expect(events.some((e) => e.type === 'message.accepted')).toBe(true);
    expect(f.store.db.pragma('foreign_key_check')).toEqual([]);
  });
  it('T02 two real SQLite turns preserve context, personalized instructions, confirmed text, message versions and metadata', async () => {
    const f = await fresh();
    f.store.db.prepare("UPDATE settings SET value_json=? WHERE key='preferences'").run(
      JSON.stringify({
        schemaVersion: 1,
        values: {
          ...f.store.settings.values,
          personalization: {
            ...f.store.settings.values.personalization,
            instructions: 'fixture 长期指令',
            chat: { language: 'zh-CN', length: 'short', tone: 'friendly', format: 'markdown' },
          },
        },
      }),
    );
    await f.send('第一轮');
    const first = await settled(f);
    expect(first.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(first.messages[1]?.text).toBe('已确认中文回答');
    expect(first.messages[1]?.model?.modelId).toBe('fixture-model');
    await f.send('第二轮');
    const second = await settled(f);
    expect(second.messages).toHaveLength(4);
    expect(f.inputs[1]?.request.messages).toEqual([
      { role: 'user', text: '第一轮' },
      { role: 'assistant', text: '已确认中文回答' },
      { role: 'user', text: '第二轮' },
    ]);
    expect(f.inputs[0]?.preferences.answer.language).toBe('zh-CN');
    expect(f.inputs[0]?.request.systemModules.some((m) => m.text === 'fixture 长期指令')).toBe(
      true,
    );
    expect(f.store.db.prepare('SELECT count(*) n FROM message_versions').get()).toEqual({ n: 2 });
  });
  it('T05 draft CAS preserves excessive text and per-window copies across restart; stale writes keep saved draft', async () => {
    const f = await fresh(undefined, false),
      text = '中'.repeat(100001);
    const save = req(
      'drafts.save',
      { sessionId: f.session, windowId: '0', text, attachments: [] },
      1,
    );
    expect((await f.chat.dispatch(save)).ok).toBe(true);
    expect((await f.chat.dispatch(save)).ok).toBe(true);
    expect(
      await f.chat.dispatch(
        req(
          'drafts.save',
          { sessionId: f.session, windowId: '0', text: '旧覆盖', attachments: [] },
          1,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(
      (
        await f.chat.dispatch(
          req(
            'drafts.save',
            { sessionId: f.session, windowId: '1', text: '第二窗口', attachments: [] },
            1,
          ),
        )
      ).ok,
    ).toBe(true);
    expect(
      await f.chat.dispatch(
        req('messages.send', {
          sessionId: f.session,
          text,
          attachments: [],
          clientMessageId: newId(),
          mode: 'chat',
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    await f.chat.stop();
    const dir = f.store.dataDir;
    f.store.close();
    const reopened = await openStore(dir);
    stores.push(reopened);
    const chat = new ChatService(reopened, new BlobStore(reopened), f.chat.models);
    services.push(chat);
    expect(
      ChatDraftViewSchema.parse(
        data(await chat.dispatch(req('drafts.get', { sessionId: f.session, windowId: '0' }))),
      ).text,
    ).toBe(text);
    expect(JSON.stringify(reopened.replay(0, 100))).not.toContain('第二窗口');
  });
  it('T05 queue can be edited/cancelled; stop retains confirmed text and starts followup once', async () => {
    let released = false;
    const f = await fresh(async function* (n, _input, signal) {
      const attemptId = newId();
      yield {
        type: 'attempt',
        attemptId,
        model: { accountId: newId(), modelId: 'fixture-model' },
        attemptNo: 1,
      };
      yield {
        type: 'model.event',
        attemptId,
        event: { type: 'text_delta', blockId: 'text', text: '保留正文' },
      };
      if (n === 1)
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              released = true;
              resolve();
            },
            { once: true },
          );
        });
      signal.throwIfAborted();
      yield {
        type: 'model.event',
        attemptId,
        event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
      };
    });
    const run = await f.send('原问题');
    await expect
      .poll(async () => (await f.snapshot()).messages.some((m) => m.text === '保留正文'))
      .toBe(true);
    const queue = await f.send('排队问题');
    const pending = (await f.snapshot()).pending[0]!;
    expect(queue.queuedInputId).toBe(pending.id);
    expect(
      (
        await f.chat.dispatch(
          req(
            'inputs.update',
            { inputId: pending.id, text: '已编辑问题', attachments: [] },
            pending.revision,
          ),
        )
      ).ok,
    ).toBe(true);
    const cancelled = await f.send('取消这条'),
      p = (await f.snapshot()).pending.find((p) => p.id === cancelled.queuedInputId)!;
    expect((await f.chat.dispatch(req('inputs.cancel', { inputId: p.id }, p.revision))).ok).toBe(
      true,
    );
    expect((await f.chat.dispatch(req('runs.cancel', { runId: run.runId }))).ok).toBe(true);
    await expect.poll(async () => f.inputs.length).toBe(2);
    await settled(f);
    expect(released).toBe(true);
    expect(
      (await f.snapshot()).messages.some(
        (m) => m.status === 'interrupted' && m.text === '保留正文',
      ),
    ).toBe(true);
    expect(
      f.inputs[1]?.request.messages.some((m) => m.role === 'user' && m.text === '已编辑问题'),
    ).toBe(true);
    expect(
      f.inputs[1]?.request.messages.some((m) => m.role === 'user' && m.text === '取消这条'),
    ).toBe(false);
  });
  it('T13 immediate steer rejects late callbacks and inherits the root budget while advancing taskVersion', async () => {
    const f = await fresh(async function* (n, _input, signal) {
      const attemptId = newId();
      yield {
        type: 'attempt',
        attemptId,
        model: { accountId: newId(), modelId: 'fixture-model' },
        attemptNo: 1,
      };
      if (n === 1) {
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'text_delta', blockId: 'x', text: '过时污染' },
        };
      }
      yield {
        type: 'model.event',
        attemptId,
        event: { type: 'text_delta', blockId: 'x', text: '新目标' },
      };
      yield {
        type: 'model.event',
        attemptId,
        event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
      };
    });
    await f.send('旧目标');
    await expect.poll(() => f.inputs.length).toBe(1);
    await f.send('新目标补充', { delivery: 'steer' });
    await expect.poll(() => f.inputs.length).toBe(2);
    await settled(f);
    expect(f.inputs[0]?.rootRunId).toBe(f.inputs[1]?.rootRunId);
    expect(f.inputs[1]?.request.taskVersion).toBe(2);
    expect((await f.snapshot()).messages.some((m) => m.text.includes('过时污染'))).toBe(false);
  });
  it('T02 half tool JSON never dispatches; complete read-only calls close before the next model request', async () => {
    const half = await fresh(async function* () {
      const attemptId = newId();
      yield {
        type: 'attempt',
        attemptId,
        model: { accountId: newId(), modelId: 'fixture-model' },
        attemptNo: 1,
      };
      yield {
        type: 'model.event',
        attemptId,
        event: {
          type: 'tool_delta',
          callId: 'half',
          name: 'files.read',
          argumentsDelta: '{\"fileVersionId\":',
        },
      };
      yield { type: 'route.error', error: { code: 'STREAM_INTERRUPTED', retryable: false } };
    });
    await half.send();
    await settled(half);
    expect(half.store.db.prepare('SELECT count(*) n FROM tool_calls').get()).toEqual({ n: 0 });
    const full = await fresh(async function* (n, input) {
      const attemptId = newId();
      yield {
        type: 'attempt',
        attemptId,
        model: { accountId: newId(), modelId: 'fixture-model' },
        attemptNo: 1,
      };
      if (n === 1) {
        yield {
          type: 'model.event',
          attemptId,
          event: {
            type: 'tool_end',
            callId: 'closed',
            name: 'history.search',
            arguments: { query: 'needle' },
          },
        };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'finish', reason: 'tool_calls', nativeStateRef: '' },
        };
      } else {
        expect(input.request.messages.at(-1)?.role).toBe('tool');
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'text_delta', blockId: 'x', text: '读取完成' },
        };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
        };
      }
    });
    await full.send('needle');
    await settled(full);
    expect(full.store.db.prepare('SELECT status,side_effect FROM tool_calls').get()).toEqual({
      status: 'succeeded',
      side_effect: 'none',
    });
    expect(full.inputs).toHaveLength(2);
  });
  it('T19 managed text upload is idempotent, refs freeze versions, binary/project materials reject model send without dropping them', async () => {
    const f = await fresh(undefined, false);
    const upload = req('inputs.attach', {
      sessionId: f.session,
      name: '材料.txt',
      bytes: Buffer.from('引用原文 中文').toString('base64'),
    });
    const material = ChatMaterialSchema.parse(data(await f.chat.dispatch(upload)));
    expect(ChatMaterialSchema.parse(data(await f.chat.dispatch(upload))).ref).toEqual(material.ref);
    expect(f.store.db.prepare('SELECT count(*) n FROM files').get()).toEqual({ n: 1 });
    expect(await f.chat.material(material.ref, f.session)).toMatchObject({
      text: '引用原文 中文',
      state: 'ready',
    });
    const binary = ChatMaterialSchema.parse(
      data(
        await f.chat.dispatch(
          req('inputs.attach', {
            sessionId: f.session,
            name: 'office.docx',
            bytes: Buffer.from([0, 1, 2]).toString('base64'),
          }),
        ),
      ),
    );
    expect(binary.state).toBe('unsupported');
    expect(
      await f.chat.dispatch(
        req('messages.send', {
          sessionId: f.session,
          text: '看材料',
          attachments: [binary.ref],
          clientMessageId: newId(),
          mode: 'chat',
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'FORMAT_UNSUPPORTED' } });
    expect(f.store.db.prepare("SELECT count(*) n FROM messages WHERE role='user'").get()).toEqual({
      n: 0,
    });
    if (material.ref.kind === 'file') {
      f.store.db.prepare('UPDATE files SET deleted_at=1 WHERE id=?').run(material.ref.fileId);
      await expect(f.chat.material(material.ref, f.session)).rejects.toThrow('NOT_FOUND');
    }
  });
  it('T05 restart closes stale running state, keeps confirmed content and never repeats the old model call', async () => {
    const f = await fresh(undefined, false);
    const r = await f.send('已确认用户');
    const sid = f.session,
      branch = f.chat.session(sid).active_branch_id,
      assistant = newId();
    f.store.db
      .prepare(
        "UPDATE runs SET status='running',started_at=1,lease_owner='dead',lease_epoch=1,lease_expires_at=2 WHERE id=?",
      )
      .run(r.runId);
    f.store.db
      .prepare(
        "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,role,content_json,status,run_id) VALUES(?,?,?,?,?,?,'assistant',?,'streaming',?)",
      )
      .run(
        assistant,
        f.store.profileId,
        1,
        1,
        sid,
        branch,
        JSON.stringify({ schemaVersion: 1, blocks: [{ kind: 'text', text: '已确认回复' }] }),
        r.runId,
      );
    f.chat.start();
    await delay(100);
    const result = await f.snapshot();
    expect(result.run?.status).toBe('partial');
    expect(result.messages.find((m) => m.id === assistant)).toMatchObject({
      text: '已确认回复',
      status: 'interrupted',
    });
    expect(f.inputs).toHaveLength(0);
    const audit = await readFile(join(f.store.dataDir, 'db/app.sqlite'));
    expect(audit.length).toBeGreaterThan(0);
  });
  it('T19 project context excludes personal background/instructions and only shares explicit permitted message refs', async () => {
    const f = await fresh();
    const project = CreatedEntitySchema.parse(
      data(f.core.dispatch(req('projects.create', { name: '隔离项目' }))),
    ).entityId;
    f.store.db.prepare('UPDATE sessions SET project_id=? WHERE id=?').run(project, f.session);
    f.store.db.prepare("UPDATE settings SET value_json=? WHERE key='preferences'").run(
      JSON.stringify({
        schemaVersion: 1,
        values: {
          ...f.store.settings.values,
          personalization: {
            ...f.store.settings.values.personalization,
            instructions: '不应注入',
          },
        },
      }),
    );
    await f.send();
    await settled(f);
    expect(f.inputs[0]?.request.systemModules.some((m) => m.id.startsWith('personal.'))).toBe(
      false,
    );
  });
});
