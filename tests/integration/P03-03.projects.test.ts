import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  BlobStore,
  FileRepository,
  openStore,
  newId,
  migrate,
  SCHEMA_VERSION,
  type Store,
} from '../../packages/storage/src';
import { CoreService } from '../../packages/core/src/service';
import { ChatService } from '../../packages/core/src/chat-service';
import { HistoryService } from '../../packages/core/src/history-service';
import { ProjectService } from '../../packages/core/src/project-service';
import { ProjectExporter } from '../../packages/core/src/project-exporter';
import {
  ProjectReplySchema,
  CreatedEntitySchema,
  ChatSnapshotSchema,
  DescriptorSchema,
  DEFAULT_MODEL_PREFERENCES,
  FILE_PARSER_VERSION,
  ParsedDocumentSchema,
  type Reply,
} from '../../packages/contracts/src';
import type { RoutingInput, RoutedEvent } from '../../packages/providers/src/routing/router';
const stores: Store[] = [],
  chats: ChatService[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of chats.splice(0)) await c.stop();
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
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const root = await mkdtemp(resolve('.test-data', 'P03-03 合成 ')),
    store = await openStore(root);
  stores.push(store);
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs),
    core = new CoreService(store),
    selection = { accountId: newId(), modelId: 'fixture' },
    inputs: RoutingInput[] = [];
  const descriptor = DescriptorSchema.parse({
    accountId: selection.accountId,
    providerId: 'openai-compatible',
    modelId: 'fixture',
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
  let tool: { name: string; arguments: Record<string, unknown> } | undefined;
  const chat = new ChatService(store, blobs, {
    catalog: async () => [descriptor],
    effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream(input: RoutingInput): AsyncIterable<RoutedEvent> {
        inputs.push(structuredClone(input));
        const attemptId = newId();
        yield { type: 'attempt', attemptId, model: selection, attemptNo: 1 };
        yield {
          type: 'model.event',
          attemptId,
          event: { type: 'text_delta', blockId: 'text', text: '合成回答' },
        };
        if (tool) {
          const next = tool;
          tool = undefined;
          yield {
            type: 'model.event',
            attemptId,
            event: {
              type: 'tool_end',
              callId: newId(),
              name: next.name,
              arguments: next.arguments,
            },
          };
          yield {
            type: 'model.event',
            attemptId,
            event: { type: 'finish', reason: 'tool_calls', nativeStateRef: '' },
          };
        } else
          yield {
            type: 'model.event',
            attemptId,
            event: { type: 'finish', reason: 'stop', nativeStateRef: '' },
          };
      },
    },
  });
  chats.push(chat);
  chat.start();
  const history = new HistoryService(store, blobs, chat),
    projects = new ProjectService(files, history);
  const project = (name = '项目甲') =>
    CreatedEntitySchema.parse(data(core.dispatch(req('projects.create', { name })))).entityId;
  const session = (projectId?: string) =>
    CreatedEntitySchema.parse(
      data(
        core.dispatch(
          req('sessions.create', {
            title: '合成会话',
            mode: 'chat',
            ...(projectId ? { projectId } : {}),
          }),
        ),
      ),
    ).entityId;
  const command = async (name: string, payload: unknown, revision?: number) =>
    ProjectReplySchema.parse(data(await projects.dispatch(req(name, payload, revision))));
  const update = async (id: string, patch: unknown) =>
    command('projects.update', { projectId: id, patch }, projects.get(id).revision);
  const put = async (projectId: string, text: string, replaceId?: string, parse = true) => {
    const blob = await blobs.put(Buffer.from(text), 'text/plain'),
      file = files.importBlob({
        blobId: blob.id,
        name: '资料.txt',
        relativePath: '资料.txt',
        owner: { type: 'project', id: projectId },
        ...(replaceId ? { replaceId } : {}),
      }).file;
    if (parse) await complete(file.currentVersionId, text);
    return file;
  };
  const complete = async (versionId: string, text: string) => {
    store.db
      .prepare("UPDATE jobs SET next_attempt_at=9999999999999 WHERE kind<>'file.parse'")
      .run();
    const jobId = files.queueParse(versionId);
    store.db.prepare('UPDATE jobs SET next_attempt_at=9999999999999 WHERE id<>?').run(jobId);
    store.db.prepare('UPDATE jobs SET next_attempt_at=0 WHERE id=?').run(jobId);
    const job = files.jobs.claim('synthetic parsed fixture')!;
    expect(job).toBeDefined();
    files.beginParse(job, versionId);
    await files.completeParse(
      job,
      versionId,
      ParsedDocumentSchema.parse({
        schemaVersion: 1,
        parserVersion: FILE_PARSER_VERSION,
        format: 'text',
        blocks: [
          { id: 'b', kind: 'text', text, locator: { kind: 'text', start: 0, end: text.length } },
        ],
        pages: [],
        sheets: [],
        slides: [],
        entries: [],
        quality: { needsOcr: false, warnings: [] },
      }),
      new AbortController().signal,
    );
    files.jobs.finish(job, 'completed', versionId);
  };
  const send = async (id: string, attachments: unknown[] = []) => {
    data(
      await chat.dispatch(
        req('messages.send', {
          sessionId: id,
          text: '合成问题',
          attachments,
          clientMessageId: newId(),
          mode: 'chat',
        }),
      ),
    );
    await expect
      .poll(
        async () =>
          ChatSnapshotSchema.parse(
            data(await chat.dispatch(req('messages.list', { sessionId: id }))),
          ).run?.status,
        { timeout: 5000 },
      )
      .toMatch(/completed|partial|failed/);
  };
  return {
    root,
    store,
    blobs,
    files,
    core,
    chat,
    history,
    projects,
    inputs,
    project,
    session,
    command,
    update,
    put,
    complete,
    send,
    setTool: (next: typeof tool) => {
      tool = next;
    },
  };
}
test('P03-03 T09 project metadata, CAS, idempotency, search, favorite and archive are persistent', async () => {
  const f = await fixture(),
    id = f.project();
  expect(f.projects.get(id)).toMatchObject({
    allowGlobalMemory: false,
    allowGlobalHistory: false,
    allowGlobalInstructions: false,
    independentMemory: true,
  });
  const r = req(
    'projects.update',
    {
      projectId: id,
      patch: { description: '唯一介绍', icon: 'book', color: '#aa1122', instructions: '规则' },
    },
    1,
  );
  expect(data(await f.projects.dispatch(r))).toHaveProperty('project');
  expect(await f.projects.dispatch(r)).toEqual(await f.projects.dispatch(r));
  expect(f.projects.get(id).revision).toBe(2);
  expect(
    await f.projects.dispatch(
      req('projects.update', { projectId: id, patch: { name: '过期写入' } }, 1),
    ),
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  const list = await f.command('projects.list', { query: '唯一介绍' });
  expect(list).toHaveProperty('projects.0.id', id);
  data(await f.history.dispatch(req('projects.pin', { projectId: id, pinned: true }, 2)));
  expect(await f.command('projects.list', { favorite: true })).toHaveProperty('projects.0.id', id);
  await f.command(
    'projects.archive',
    { projectId: id, archived: true },
    f.projects.get(id).revision,
  );
  expect(await f.command('projects.list', {})).toHaveProperty('projects.length', 0);
  expect(await f.command('projects.list', { archived: true })).toHaveProperty('projects.0.id', id);
  await migrate(f.store.db, join(f.root, 'backups/migrations'));
  expect(f.store.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  expect(f.projects.get(id).description).toBe('唯一介绍');
});
test('P03-03 T10 query and model traces exclude the other project marker and open original locators', async () => {
  const f = await fixture(),
    a = f.project(),
    b = f.project('项目乙'),
    sa = f.session(a);
  const fa = await f.put(a, '项目甲唯一标记甲'),
    fb = await f.put(b, '项目乙唯一标记乙');
  const hits = await f.projects.query(a, '唯一标记');
  expect(hits.hits).toHaveLength(1);
  expect(hits.hits[0]!.ref).toMatchObject({
    fileId: fa.id,
    versionId: fa.version.id,
    locator: { kind: 'text', start: 0 },
  });
  expect(JSON.stringify(hits)).not.toContain('项目乙唯一标记乙');
  await expect(
    f.chat.material({ kind: 'file', fileId: fb.id, versionId: fb.version.id }, sa),
  ).rejects.toThrow('PERMISSION_DENIED');
  f.setTool({ name: 'knowledge.query', arguments: { query: '唯一标记' } });
  await f.send(sa);
  expect(JSON.stringify(f.inputs)).toContain('项目甲唯一标记甲');
  expect(JSON.stringify(f.inputs)).not.toContain('项目乙唯一标记乙');
  expect(f.inputs.length).toBe(2);
});
test.each(['allowGlobalMemory', 'allowGlobalHistory', 'allowGlobalInstructions'] as const)(
  'P03-03 T10 enabling %s opens only that background type',
  async (toggle) => {
    const f = await fixture(),
      id = f.project(),
      sid = f.session(id),
      outside = f.session(),
      other = f.project('私有乙');
    const personal = f.store.settings.values;
    data(
      f.core.dispatch(
        req(
          'settings.set',
          {
            scope: { type: 'profile', id: f.store.profileId },
            patch: {
              personalization: {
                ...personal.personalization,
                enabled: true,
                instructions: '全局指令唯一标记',
              },
            },
          },
          f.store.settings.revision,
        ),
      ),
    );
    const now = f.store.now();
    for (const [scope, id2, marker] of [
      ['profile', f.store.profileId, '全局记忆唯一标记'],
      ['project', other, '他项目记忆唯一标记'],
      ['project', id, '项目内记忆唯一标记'],
    ] as const)
      f.store.db
        .prepare(
          'INSERT INTO memories(id,profile_id,created_at,updated_at,subject,predicate,value_json,scope_type,scope_id,valid_from,content_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          newId(),
          f.store.profileId,
          now,
          now,
          marker,
          'value',
          JSON.stringify(marker),
          scope,
          id2,
          now,
          marker,
        );
    f.chat.insertMessage(f.chat.session(outside), 'user', '全局历史唯一标记', 'final', null);
    f.setTool({ name: 'history.search', arguments: { query: '唯一标记' } });
    await f.send(sid);
    const initial = JSON.stringify(f.inputs);
    expect(initial).not.toContain('全局记忆唯一标记');
    expect(initial).not.toContain('全局指令唯一标记');
    expect(initial).not.toContain('全局历史唯一标记');
    expect(initial).toContain('项目内记忆唯一标记');
    f.inputs.length = 0;
    await f.update(id, { [toggle]: true });
    f.setTool({ name: 'history.search', arguments: { query: '唯一标记' } });
    await f.send(sid);
    const trace = JSON.stringify(f.inputs);
    expect(trace.includes('全局记忆唯一标记')).toBe(toggle === 'allowGlobalMemory');
    expect(trace.includes('全局指令唯一标记')).toBe(toggle === 'allowGlobalInstructions');
    expect(trace.includes('全局历史唯一标记')).toBe(toggle === 'allowGlobalHistory');
    expect(trace).not.toContain('他项目记忆唯一标记');
  },
);
test('P03-03 overview uses actual session, task run state, sources and output identities', async () => {
  const f = await fixture(),
    id = f.project(),
    sid = f.session(id);
  await f.command(
    'projects.addText',
    { projectId: id, name: '成果笔记', text: '合成成果' },
    f.projects.get(id).revision,
  );
  await f.send(sid);
  const result = await f.command('projects.overview', { projectId: id });
  expect(result).toMatchObject({
    overview: {
      sessions: [{ id: sid, title: '合成会话', status: 'chat' }],
      tasks: [{ title: '合成问题', status: 'completed' }],
      sources: [{ title: '成果笔记.txt', status: 'ready' }],
      outputs: [{ title: '成果笔记.txt', status: 'ready' }],
    },
  });
});

test('P03-03 T10 project-only scope enforces selected resources and disables history/background tools', async () => {
  const f = await fixture(),
    id = f.project(),
    sid = f.session(id),
    a = await f.put(id, '选择甲唯一标记'),
    b = await f.put(id, '未选择乙唯一标记');
  await f.update(id, {
    allowGlobalHistory: true,
    allowGlobalMemory: true,
    allowGlobalInstructions: true,
  });
  await f.command(
    'projects.sessionScope',
    { sessionId: sid, scope: { selectedVersionIds: [a.version.id], projectOnly: true } },
    f.projects.scope(sid).revision,
  );
  f.setTool({ name: 'knowledge.query', arguments: { query: '唯一标记' } });
  await f.send(sid);
  expect(JSON.stringify(f.inputs)).toContain('选择甲唯一标记');
  expect(JSON.stringify(f.inputs)).not.toContain('未选择乙唯一标记');
  expect(f.inputs[0]!.request.tools.some((t) => t.name === 'history.search')).toBe(false);
  expect(
    await f.projects.dispatch(
      req(
        'projects.sessionScope',
        { sessionId: sid, scope: { selectedVersionIds: [newId()] } },
        f.projects.scope(sid).revision,
      ),
    ),
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  expect(await f.projects.query(id, '唯一标记', [])).toMatchObject({ hits: [] });
  expect(b.id).not.toBe(a.id);
});
test('P03-03 T09 replacement keeps the old index on pending/failure, commits the complete new index and rejects a mixed read', async () => {
  const f = await fixture(),
    id = f.project(),
    old = await f.put(id, '完整旧版唯一标记'),
    next = await f.put(id, '完整新版唯一标记', old.id, false);
  expect(f.projects.materials(id)[0]).toMatchObject({
    file: { version: { id: old.version.id } },
    pendingVersionId: next.version.id,
    state: 'preparing',
  });
  expect(await f.projects.query(id, '唯一标记')).toHaveProperty('hits.0.text', '完整旧版唯一标记');
  f.store.db
    .prepare("UPDATE file_versions SET parse_status='failed' WHERE id=?")
    .run(next.version.id);
  expect(f.projects.materials(id)[0]!.state).toBe('failed');
  expect(await f.projects.query(id, '唯一标记')).toHaveProperty('hits.0.text', '完整旧版唯一标记');
  const actual = f.files.parsed.bind(f.files);
  vi.spyOn(f.files, 'parsed').mockImplementationOnce(async (...args) => {
    const result = await actual(...args);
    await f.complete(next.version.id, '完整新版唯一标记');
    return result;
  });
  await expect(f.projects.query(id, '唯一标记')).rejects.toThrow('CONFLICT');
  vi.restoreAllMocks();
  expect(await f.projects.query(id, '唯一标记')).toHaveProperty('hits.0.text', '完整新版唯一标记');
  expect((await f.files.original(old.id, { versionId: old.version.id })).bytes.toString()).toBe(
    '完整旧版唯一标记',
  );
});
test('P03-03 T19 query rechecks revocation after derived I/O and refuses foreign version/folder IDs', async () => {
  const f = await fixture(),
    a = f.project(),
    b = f.project('乙'),
    fa = await f.put(a, '甲唯一标记'),
    fb = await f.put(b, '乙唯一标记');
  await expect(f.projects.query(a, '唯一标记', [fb.version.id])).rejects.toThrow(
    'PERMISSION_DENIED',
  );
  const folder = f.files.createFolder('乙目录', null, { type: 'project', id: b });
  expect(
    await f.projects.dispatch(
      req(
        'projects.classifyMaterial',
        { projectId: a, fileId: fa.id, folderId: folder.id, tags: [], expiresAt: null },
        f.projects.get(a).revision,
      ),
    ),
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  const actual = f.blobs.readDerivedVersion.bind(f.blobs);
  vi.spyOn(f.blobs, 'readDerivedVersion').mockImplementationOnce(async (...args) => {
    const value = await actual(...args);
    f.files.unlink([fa.id], { type: 'project', id: a });
    return value;
  });
  await expect(f.projects.query(a, '唯一标记')).rejects.toThrow('PERMISSION_DENIED');
});
test('P03-03 local note/URL snapshot has known exact text, empty snapshots stay unusable, expiry and tags persist', async () => {
  const f = await fixture(),
    id = f.project();
  await f.command(
    'projects.addText',
    { projectId: id, name: '手工笔记', text: '正文唯一标记', url: 'https://example.com/source' },
    f.projects.get(id).revision,
  );
  const m = f.projects.materials(id)[0]!;
  expect(m).toMatchObject({
    state: 'ready',
    source: 'https://example.com/source',
    indexVersion: 1,
  });
  expect(await f.projects.query(id, '唯一标记')).toHaveProperty('hits.0.text', '正文唯一标记');
  expect(
    f.store.db.prepare("SELECT 1 FROM jobs WHERE kind='file.parse' AND status='queued'").get(),
  ).toBeUndefined();
  await f.command(
    'projects.classifyMaterial',
    {
      projectId: id,
      fileId: m.file.id,
      folderId: null,
      tags: ['甲'],
      expiresAt: f.store.now() - 1,
    },
    f.projects.get(id).revision,
  );
  expect(f.projects.materials(id)[0]).toMatchObject({ state: 'expired', tags: ['甲'] });
  expect((await f.projects.query(id, '唯一标记')).hits).toHaveLength(0);
  await f.command(
    'projects.addText',
    { projectId: id, name: '空快照', text: '', url: 'https://example.com/empty' },
    f.projects.get(id).revision,
  );
  expect(f.projects.materials(id).find((m) => m.file.name === '空快照.txt')!.state).toBe('failed');
  expect(
    await f.projects.dispatch(
      req(
        'projects.addText',
        { projectId: id, name: '坏URL', text: 'x', url: 'file:///private' },
        f.projects.get(id).revision,
      ),
    ),
  ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
});
test('P03-03 copy shares immutable files and clones conversations, deleting the original preserves shared access', async () => {
  const f = await fixture(),
    id = f.project(),
    sid = f.session(id),
    file = await f.put(id, '共享唯一标记');
  await f.send(sid, [{ kind: 'file', fileId: file.id, versionId: file.version.id }]);
  const copy = await f.command('projects.copy', { projectId: id }, f.projects.get(id).revision);
  if (!('project' in copy)) throw Error('missing copy');
  const target = copy.project.id;
  expect(f.projects.links(target)[0]!.pinned_version_id).toBe(file.version.id);
  const sessions = f.store.db
    .prepare('SELECT id FROM sessions WHERE project_id=? AND deleted_at IS NULL')
    .all(target) as { id: string }[];
  expect(sessions).toHaveLength(1);
  expect(
    ChatSnapshotSchema.parse(
      data(await f.chat.dispatch(req('messages.list', { sessionId: sessions[0]!.id }))),
    ).messages,
  ).toHaveLength(2);
  expect(f.projects.impact(id).sharedFileIds).toContain(file.id);
  await f.command(
    'projects.trash',
    { projectId: id, trashExclusiveFiles: true },
    f.projects.get(id).revision,
  );
  expect(f.chat.session(sid).project_id).toBeNull();
  expect(
    (
      await f.files.original(file.id, {
        versionId: file.version.id,
        owner: { type: 'project', id: target },
      })
    ).bytes.toString(),
  ).toBe('共享唯一标记');
});
test('P03-03 project export is a real ZIP with immutable originals, refuses overwrite and revoked access', async () => {
  const f = await fixture(),
    id = f.project(),
    file = await f.put(id, '导出原件唯一标记'),
    exporter = new ProjectExporter(f.projects),
    target = join(f.root, 'project.zip');
  await exporter.export('0', id, f.projects.get(id).revision, target);
  const bytes = await readFile(target);
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from('PK\x03\x04'));
  expect(bytes.includes(Buffer.from('导出原件唯一标记'))).toBe(true);
  expect(bytes.includes(Buffer.from('project.json'))).toBe(true);
  await expect(exporter.export('0', id, f.projects.get(id).revision, target)).rejects.toMatchObject(
    { code: 'EEXIST' },
  );
  expect(await readFile(target)).toEqual(bytes);
  const sentinel = join(f.root, 'existing.zip');
  await writeFile(sentinel, 'sentinel');
  const actual = f.files.original.bind(f.files);
  vi.spyOn(f.files, 'original').mockImplementationOnce(async (...args) => {
    const result = await actual(...args);
    f.files.unlink([file.id], { type: 'project', id });
    return result;
  });
  const revoked = join(f.root, 'revoked.zip');
  await expect(exporter.export('0', id, f.projects.get(id).revision, revoked)).rejects.toThrow(
    'CONFLICT',
  );
  expect(await stat(revoked).catch(() => undefined)).toBeUndefined();
  vi.restoreAllMocks();
  await expect(exporter.export('0', id, 1, sentinel)).rejects.toMatchObject({ code: 'EEXIST' });
  expect((await readFile(sentinel)).toString()).toBe('sentinel');
  await exporter.stop();
});
test('P03-03 migrated generated notes retain the known legacy text index without a binary fallback', async () => {
  const f = await fixture(),
    id = f.project(),
    blob = await f.blobs.put(Buffer.from('旧笔记唯一标记'), 'text/markdown'),
    note = f.blobs.attach(blob.id, '旧笔记.md');
  f.store.db
    .prepare("UPDATE files SET kind='note',source_type='generated' WHERE id=?")
    .run(note.id);
  f.store.db
    .prepare(
      "UPDATE file_versions SET parse_status='ready',extension='md',display_name='旧笔记.md' WHERE id=?",
    )
    .run(note.versionId);
  f.store.db
    .prepare('INSERT INTO file_search_documents VALUES(?,?,?,?)')
    .run(note.versionId, note.id, f.store.profileId, '旧笔记唯一标记');
  f.files.link(note.id, note.versionId, { type: 'project', id });
  expect(f.projects.materials(id)[0]!.state).toBe('ready');
  expect(await f.projects.query(id, '唯一标记')).toHaveProperty('hits.0.text', '旧笔记唯一标记');
});
test('P03-03 active run blocks scope, rules, archive and deletion until it terminates', async () => {
  const f = await fixture(),
    id = f.project(),
    sid = f.session(id);
  f.chat.stop();
  const sent = data(
    await f.chat.dispatch(
      req('messages.send', {
        sessionId: sid,
        text: '排队合成',
        attachments: [],
        clientMessageId: newId(),
        mode: 'chat',
      }),
    ),
  );
  expect(sent).toHaveProperty('runId');
  for (const [command, payload, revision] of [
    [
      'projects.update',
      { projectId: id, patch: { instructions: '晚到规则' } },
      f.projects.get(id).revision,
    ],
    ['projects.archive', { projectId: id, archived: true }, f.projects.get(id).revision],
    ['projects.trash', { projectId: id }, f.projects.get(id).revision],
    [
      'projects.sessionScope',
      { sessionId: sid, scope: { projectOnly: true } },
      f.projects.scope(sid).revision,
    ],
  ] as const)
    expect(await f.projects.dispatch(req(command, payload, revision))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
});
