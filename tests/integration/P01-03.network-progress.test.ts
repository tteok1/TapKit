import { it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openStore, BlobStore, newId } from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ChatService } from '../../packages/core/src/chat-service';
import { ModelService } from '../../packages/core/src/model-service';
import { ProviderService } from '../../packages/core/src/provider-service';
import { installChatFixture } from '../../packages/core/src/chat-fixture';
import { ApiKeyAdapter } from '../../packages/providers/src';
import { ApiFailure } from '../../packages/providers/src/api/http';
import { memoryNative, events, sseFrames } from '../fixtures/P01-02.api';
import {
  DEFAULT_MODEL_PREFERENCES,
  ChatSnapshotSchema,
  ChatSendViewSchema,
  CreatedEntitySchema,
  resolveApiConfig,
  type Reply,
} from '../../packages/contracts/src';

const req = (command: string, payload: unknown) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
});
const data = (r: Reply) => {
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};
it('P01-03 budget restoration permits dispatch; failed retry and cancellation settle separately and expose safe progress', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P01-03-network-'));
  await writeFile(resolve(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  const store = await openStore(dir);
  const providers = new ProviderService(store, async () => ({ key: 'fixture-only' }));
  const models = new ModelService(store, providers);
  installChatFixture(models);
  const descriptor = (await models.catalog())[0]!;
  let calls = 0;
  const adapter = new ApiKeyAdapter(
    descriptor.accountId!,
    resolveApiConfig('openai-compatible', {
      baseURL: 'https://fixture.invalid/v1',
      apiFormat: 'openai-chat',
      modelId: descriptor.modelId,
    }),
    async () => 'fixture-only',
    memoryNative().store,
    async (_input, init) => {
      calls++;
      if (calls === 1)
        throw new ApiFailure({
          code: 'NETWORK_ERROR',
          retryable: true,
          diagnosticCode: 'response_headers_timeout',
        });
      if (calls === 2)
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('CANCELLED')), {
            once: true,
          });
        });
      return sseFrames(events('openai-chat', false, false, undefined, 'OK'));
    },
  );
  models.router.deps.adapter = () => adapter;
  models.router.deps.wait = async (_ms, signal) => signal.throwIfAborted();
  const chat = new ChatService(store, new BlobStore(store), models);
  chat.start();
  try {
    const core = new CoreService(store);
    const sessionId = CreatedEntitySchema.parse(
      data(core.dispatch(req('sessions.create', { mode: 'chat', title: 'budget fixture' }))),
    ).entityId;
    const snapshot = async () =>
      ChatSnapshotSchema.parse(data(await chat.dispatch(req('messages.list', { sessionId }))));
    const send = async () =>
      ChatSendViewSchema.parse(
        data(
          await chat.dispatch(
            req('messages.send', {
              sessionId,
              clientMessageId: newId(),
              text: '预算拦截测试：只回复OK。',
              attachments: [],
              mode: 'chat',
            }),
          ),
        ),
      );
    const scope = { type: 'profile' as const, id: store.profileId };
    const preferences = {
      ...DEFAULT_MODEL_PREFERENCES,
      selection: { accountId: descriptor.accountId!, modelId: descriptor.modelId },
      onlyThisModel: true,
    };
    store.db.transaction(() =>
      models.ledger.setPreferences(
        scope,
        {
          ...preferences,
          dailyTokenLimit: 1,
        },
        models.ledger.preferences(scope).revision,
      ),
    )();
    await send();
    await expect.poll(async () => (await snapshot()).run?.status).toBe('budget_stopped');
    expect((await snapshot()).run).toMatchObject({
      errorCode: 'BUDGET_EXCEEDED',
      calls: 1,
      attempts: 0,
      retries: 0,
    });
    expect(calls).toBe(0);
    expect(store.db.prepare('SELECT count(*) AS n FROM usage_ledger').get()).toEqual({ n: 0 });

    store.db.transaction(() =>
      models.ledger.setPreferences(
        scope,
        {
          ...preferences,
          dailyTokenLimit: 2000000,
        },
        models.ledger.preferences(scope).revision,
      ),
    )();
    const recovery = await send();
    await expect.poll(() => calls).toBe(2);
    const active = await snapshot();
    expect(active.run).toMatchObject({ status: 'running', calls: 1, attempts: 2, retries: 1 });
    expect(active.messages.filter((m) => m.role === 'assistant')).toHaveLength(2);
    expect(active.messages.find((m) => m.errorCode === 'NETWORK_ERROR')).toMatchObject({
      status: 'interrupted',
      text: '',
      diagnosticCode: 'response_headers_timeout',
    });
    data(await chat.dispatch(req('runs.cancel', { runId: recovery.runId })));
    await expect.poll(async () => (await snapshot()).run?.status).toBe('cancelled');
    const rows = store.db
      .prepare(
        'SELECT a.id,a.logical_call_id,a.attempt_no,a.status,a.error_code,a.reserved_tokens,u.source,u.charged_tokens,u.input_tokens,u.output_tokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id=? ORDER BY a.attempt_no',
      )
      .all(recovery.runId!) as Record<string, any>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).not.toBe(rows[1]!.id);
    expect(rows[0]!.logical_call_id).toBe(rows[1]!.logical_call_id);
    expect(rows.map((r) => [r.attempt_no, r.status, r.error_code])).toEqual([
      [1, 'failed', 'NETWORK_ERROR'],
      [2, 'cancelled', 'CANCELLED'],
    ]);
    for (const row of rows) {
      expect(row.source).toBe('estimated');
      expect(row.charged_tokens).toBe(row.reserved_tokens);
      expect(row.input_tokens).toBeNull();
      expect(row.output_tokens).toBeNull();
    }
    expect((await snapshot()).run?.usage).toEqual({
      state: 'estimated',
      tokens: rows.reduce((n, r) => n + r.charged_tokens, 0),
    });
    expect(store.db.prepare('SELECT sum(reserved_tokens) AS n FROM budgets').get()).toEqual({
      n: 0,
    });
    await send();
    await expect.poll(async () => (await snapshot()).run?.status).toBe('completed');
    expect(calls).toBe(3);
    expect((await snapshot()).run).toMatchObject({
      attempts: 1,
      retries: 0,
      usage: { state: 'actual', tokens: 15 },
    });
    expect(store.db.prepare('SELECT count(*) AS n FROM usage_ledger').get()).toEqual({ n: 3 });
  } finally {
    await chat.stop();
    await models.stop();
    await providers.stop();
    store.close();
  }
});
