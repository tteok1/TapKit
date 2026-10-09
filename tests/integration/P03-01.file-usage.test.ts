import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BlobStore,
  FileRepository,
  newId,
  openStore,
  type Store,
} from '../../packages/storage/src';
import { ChatService } from '../../packages/core/src/chat-service';
import { CoreService } from '../../packages/core/src/service';
import { HistoryService } from '../../packages/core/src/history-service';
import {
  ChatMaterialSchema,
  ChatSendViewSchema,
  CreatedEntitySchema,
  DEFAULT_MODEL_PREFERENCES,
  DescriptorSchema,
  type Reply,
} from '../../packages/contracts/src';
const stores: Store[] = [],
  chats: ChatService[] = [];
afterEach(async () => {
  for (const chat of chats.splice(0)) await chat.stop();
  for (const store of stores.splice(0)) if (store.db.open) store.close();
});
const req = (command: string, payload: unknown) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
});
function data(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const directory = await mkdtemp(resolve('.test-data', 'P03-01 file usage '));
  const store = await openStore(directory);
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    core = new CoreService(store);
  const accountId = newId();
  const descriptor = DescriptorSchema.parse({
    accountId,
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
  const chat = new ChatService(store, blobs, {
    catalog: async () => [descriptor],
    effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream() {
        throw new Error('No model execution is allowed in this usage fixture');
      },
    },
  });
  chats.push(chat); // Intentionally do not start the scheduler or call a real model.
  const session = CreatedEntitySchema.parse(
    data(core.dispatch(req('sessions.create', { mode: 'chat', title: '中文资料会话' }))),
  ).entityId;
  const material = ChatMaterialSchema.parse(
    data(
      await chat.dispatch(
        req('inputs.attach', {
          sessionId: session,
          name: '资料.txt',
          bytes: Buffer.from('原件不变').toString('base64'),
        }),
      ),
    ),
  );
  if (material.ref.kind !== 'file') throw new Error('Expected managed file');
  const ref = material.ref;
  const send = async (text = '阅读资料', attachments = [ref], clientMessageId = newId()) =>
    ChatSendViewSchema.parse(
      data(
        await chat.dispatch(
          req('messages.send', {
            sessionId: session,
            text,
            attachments,
            clientMessageId,
            mode: 'chat',
          }),
        ),
      ),
    );
  const history = new HistoryService(store, blobs, chat);
  return { store, directory, blobs, files, chat, core, session, ref, send, history };
}
test('P03-01 usage reads actual accepted run attachments, distinguishes queued inputs and preserves pinned historical versions across restart', async () => {
  const f = await fixture();
  f.files.link(f.ref.fileId, f.ref.versionId, { type: 'session', id: f.session });
  expect(f.files.usage(f.ref.fileId)).toMatchObject({
    links: [{ ownerName: '中文资料会话' }],
    records: [],
  });
  const client = newId(),
    first = await f.send('阅读固定版本', [f.ref, f.ref], client);
  await f.send('阅读固定版本', [f.ref, f.ref], client);
  const record = f.files.usage(f.ref.fileId).records;
  expect(record).toHaveLength(1);
  expect(record[0]).toMatchObject({
    runId: first.runId,
    versionId: f.ref.versionId,
    sessionTitle: '中文资料会话',
    taskTitle: '阅读固定版本',
    taskVersion: 1,
    status: 'queued',
  });
  const pending = await f.send('稍后阅读');
  expect(pending.queuedInputId).toBeDefined();
  expect(f.files.usage(f.ref.fileId).records).toHaveLength(1);
  data(
    await f.chat.dispatch({
      ...req('inputs.cancel', { inputId: pending.queuedInputId }),
      expectedRevision: 1,
    }),
  );
  data(await f.chat.dispatch(req('runs.cancel', { runId: first.runId })));
  const before = await f.blobs.readVersion(f.ref.versionId);
  const blob = await f.blobs.put(Buffer.from('新版内容'), 'text/plain');
  const replacement = f.files.importBlob({
    blobId: blob.id,
    name: '资料.txt',
    relativePath: '资料.txt',
    owner: { type: 'library' },
    replaceId: f.ref.fileId,
  }).file;
  expect(replacement.currentVersionId).not.toBe(f.ref.versionId);
  expect(f.files.usage(f.ref.fileId).records[0]).toMatchObject({
    versionId: f.ref.versionId,
    status: 'cancelled',
  });
  await f.chat.stop();
  f.store.close();
  const reopened = await openStore(f.directory);
  stores.push(reopened);
  const files = new FileRepository(reopened, new BlobStore(reopened));
  expect(files.usage(f.ref.fileId).records[0]).toMatchObject({
    versionId: f.ref.versionId,
    taskTitle: '阅读固定版本',
  });
  expect((await files.original(f.ref.fileId, { versionId: f.ref.versionId })).bytes).toEqual(
    before,
  );
});
test('P03-01 usage follows session trash/restore/permanent deletion and never resurrects task metadata', async () => {
  const f = await fixture(),
    run = await f.send();
  data(await f.chat.dispatch(req('runs.cancel', { runId: run.runId })));
  f.files.link(f.ref.fileId, f.ref.versionId, { type: 'session', id: f.session });
  data(await f.history.dispatch(req('sessions.trash', { sessionIds: [f.session] })));
  expect(f.files.usage(f.ref.fileId)).toMatchObject({ links: [], records: [] });
  data(await f.history.dispatch(req('sessions.restore', { sessionIds: [f.session] })));
  expect(f.files.usage(f.ref.fileId).records).toHaveLength(1);
  data(await f.history.dispatch(req('sessions.trash', { sessionIds: [f.session] })));
  data(await f.history.dispatch(req('sessions.purge', { sessionIds: [f.session] })));
  expect(f.files.usage(f.ref.fileId)).toMatchObject({ links: [], records: [] });
  expect((await f.blobs.readVersion(f.ref.versionId)).toString()).toBe('原件不变');
});
test('P03-01 usage keeps the goal and attachment of each accepted task version rather than current task metadata', async () => {
  const f = await fixture(),
    first = await f.send('旧任务目标');
  data(await f.chat.dispatch(req('runs.cancel', { runId: first.runId })));
  const old = f.files.usage(f.ref.fileId).records[0]!;
  const next = f.store.db.transaction(() => {
    const now = f.store.now();
    f.store.db
      .prepare('UPDATE tasks SET goal=?,current_version=2 WHERE id=?')
      .run('新任务目标', old.taskId);
    f.store.db
      .prepare(
        `INSERT INTO task_versions(id,profile_id,created_at,updated_at,task_id,version,goal,constraints_json,plan_json) VALUES(?,?,?,?,?,2,?,'{"schemaVersion":1,"values":[]}','{"schemaVersion":1,"steps":[]}')`,
      )
      .run(newId(), f.store.profileId, now, now, old.taskId, '新任务目标');
    const message = f.chat.insertMessage(
      f.chat.session(f.session),
      'user',
      '新任务目标',
      'final',
      null,
      { attachments: [f.ref] },
    );
    return f.chat.createRun(f.chat.session(f.session), message, null, {
      id: old.taskId,
      version: 2,
      rootRunId: old.runId,
    });
  })();
  const records = f.files.usage(f.ref.fileId).records;
  expect(records.find((r) => r.runId === first.runId)).toMatchObject({
    taskTitle: '旧任务目标',
    taskVersion: 1,
  });
  expect(records.find((r) => r.runId === next)).toMatchObject({
    taskTitle: '新任务目标',
    taskVersion: 2,
  });
  f.store.db
    .prepare('UPDATE task_versions SET goal=? WHERE task_id=? AND version=2')
    .run('😀'.repeat(200), old.taskId);
  expect(f.files.usage(f.ref.fileId).records.find((r) => r.runId === next)?.taskTitle).toBe(
    '😀'.repeat(80),
  );
});
test('P03-01 usage excludes cross-profile owners/versions, missing attachments and malformed metadata', async () => {
  const f = await fixture(),
    run = await f.send();
  const otherProfile = newId();
  // Single-profile schema cannot contain a second profile. Fault-inject only this synthetic DB
  // to verify the read boundary also rejects corrupt/dangling foreign-profile metadata.
  f.store.db.pragma('foreign_keys = OFF');
  const original = f.store.db
    .prepare('SELECT chat_json FROM messages WHERE id=?')
    .get(run.messageId) as { chat_json: string };
  for (const value of [
    'invalid JSON',
    '{"attachments":["text",1,null]}',
    JSON.stringify({ attachments: [{ ...f.ref, fileId: newId() }] }),
    JSON.stringify({ attachments: [{ ...f.ref, versionId: newId() }] }),
  ]) {
    f.store.db.prepare('UPDATE messages SET chat_json=? WHERE id=?').run(value, run.messageId);
    expect(f.files.usage(f.ref.fileId).records).toEqual([]);
  }
  f.store.db
    .prepare('UPDATE messages SET chat_json=? WHERE id=?')
    .run(original.chat_json, run.messageId);
  f.store.db
    .prepare('UPDATE tasks SET profile_id=? WHERE id=(SELECT task_id FROM runs WHERE id=?)')
    .run(otherProfile, run.runId);
  expect(f.files.usage(f.ref.fileId).records).toEqual([]);
  f.store.db
    .prepare('UPDATE tasks SET profile_id=? WHERE id=(SELECT task_id FROM runs WHERE id=?)')
    .run(f.store.profileId, run.runId);
  f.store.db
    .prepare('UPDATE file_versions SET profile_id=? WHERE id=?')
    .run(otherProfile, f.ref.versionId);
  expect(f.files.usage(f.ref.fileId).records).toEqual([]);
  f.store.db
    .prepare('UPDATE file_versions SET profile_id=? WHERE id=?')
    .run(f.store.profileId, f.ref.versionId);
  f.files.link(f.ref.fileId, f.ref.versionId, { type: 'session', id: f.session });
  f.store.db.prepare('UPDATE sessions SET profile_id=? WHERE id=?').run(otherProfile, f.session);
  expect(f.files.usage(f.ref.fileId)).toMatchObject({ links: [], records: [] });
});
test('P03-01 usage bounds newest distinct execution records and retains metadata in file trash without granting downloads', async () => {
  const f = await fixture(),
    session = f.chat.session(f.session);
  for (let n = 0; n < 105; n++) {
    f.store.db.transaction(() => {
      const id = f.chat.insertMessage(session, 'user', '任务 ' + n, 'final', null, {
        attachments: [f.ref],
      });
      const runId = f.chat.createRun(session, id, null);
      // Explicit distinct times test newest ordering independently of UUID randomness within a ms.
      f.store.db.prepare('UPDATE runs SET created_at=? WHERE id=?').run(n + 1, runId);
    })();
  }
  const usage = f.files.usage(f.ref.fileId);
  expect(usage.records).toHaveLength(100);
  expect(usage.recordsTruncated).toBe(true);
  expect(usage.records[0]?.taskTitle).toBe('任务 104');
  expect(usage.records.at(-1)?.taskTitle).toBe('任务 5');
  f.files.trash([f.ref.fileId]);
  expect(() => f.files.usage(f.ref.fileId)).toThrow('NOT_FOUND');
  expect(f.files.usage(f.ref.fileId, true).records).toHaveLength(100);
  await expect(f.files.original(f.ref.fileId)).rejects.toThrow('NOT_FOUND');
});
