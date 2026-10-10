import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  openStore,
  BlobStore,
  newId,
  Store,
  migrate,
  migrations,
  FileRepository,
} from '../../packages/storage/src';
import { createRequire } from 'node:module';
const Database = createRequire(import.meta.url)(
  '../../packages/storage/node_modules/better-sqlite3',
) as typeof import('better-sqlite3');
import { CoreService } from '../../packages/core/src/service';
import { ChatService } from '../../packages/core/src/chat-service';
import { HistoryService } from '../../packages/core/src/history-service';
import { TemporaryService } from '../../packages/core/src/temporary-service';
import { ModelService } from '../../packages/core/src/model-service';
import { ProviderService } from '../../packages/core/src/provider-service';
import { installChatFixture } from '../../packages/core/src/chat-fixture';
import {
  ChatSnapshotSchema,
  ChatSendViewSchema,
  SessionDetailsSchema,
  SessionPageSchema,
  SearchPageSchema,
  SidebarViewSchema,
  BranchChangeSchema,
  DeletePreviewSchema,
  type Reply,
  type ModelRequest,
} from '../../packages/contracts/src';
const stores: Store[] = [],
  chats: ChatService[] = [],
  histories: HistoryService[] = [],
  temps: TemporaryService[] = [],
  modelsList: ModelService[] = [];
afterEach(async () => {
  for (const t of temps.splice(0)) await t.stop();
  for (const h of histories.splice(0)) await h.stop();
  for (const c of chats.splice(0)) await c.stop();
  for (const m of modelsList.splice(0)) await m.stop();
  for (const s of stores.splice(0)) if (s.db.open) s.close();
});
const req = (
  command: string,
  payload: unknown = {},
  expectedRevision?: number,
  windowId?: string,
) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  command,
  payload,
  ...(expectedRevision === undefined ? {} : { expectedRevision }),
  ...(windowId ? { windowId } : {}),
});
const data = (r: Reply) => {
  if (!r.ok) throw new Error(r.error.code);
  return r.data;
};
async function fresh() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data/P02-03 fixture ')),
    store = await openStore(dir);
  stores.push(store);
  await writeFile(join(dir, 'P02-02.fixture'), 'P02-02 isolated fixture');
  let vault = 0;
  const providers = new ProviderService(store, async () => {
      vault++;
      throw new Error('NO_REAL_CREDENTIALS');
    }),
    models = new ModelService(store, providers);
  modelsList.push(models);
  installChatFixture(models);
  const inputs: ModelRequest[] = [],
    adapter = models.router.deps.adapter;
  models.router.deps.adapter = (id) => {
    const a = adapter(id);
    return {
      ...a,
      async *stream(input, signal) {
        inputs.push(structuredClone(input));
        yield* a.stream(input, signal);
      },
    };
  };
  const core = new CoreService(store),
    blobs = new BlobStore(store),
    chat = new ChatService(store, blobs, models),
    history = new HistoryService(store, blobs, chat);
  chats.push(chat);
  histories.push(history);
  chat.start();
  const session = (
    data(core.dispatch(req('sessions.create', { mode: 'chat', title: '组织中文测试' }))) as {
      entityId: string;
    }
  ).entityId;
  const snapshot = async (id = session) =>
    ChatSnapshotSchema.parse(
      data(await chat.dispatch(req('messages.list', { sessionId: id, limit: 100 }))),
    );
  const details = async (id = session) =>
    SessionDetailsSchema.parse(
      data(await history.dispatch(req('sessions.get', { sessionId: id }))),
    );
  const send = async (text: string, id = session) => {
    const r = ChatSendViewSchema.parse(
      data(
        await chat.dispatch(
          req('messages.send', {
            sessionId: id,
            text,
            attachments: [],
            clientMessageId: newId(),
            mode: 'chat',
          }),
        ),
      ),
    );
    await expect
      .poll(async () => (await snapshot(id)).run?.status, { timeout: 5000 })
      .toBe('completed');
    return r;
  };
  return {
    store,
    dir,
    providers,
    models,
    chat,
    history,
    core,
    session,
    snapshot,
    details,
    send,
    inputs,
    vault: () => vault,
  };
}
describe('P02-03 history lifecycle', () => {
  it('P03-01 generated notes reject a message revision or session scope change during blob I/O without publishing stale content', async () => {
    for (const change of ['revision', 'scope']) {
      const f = await fresh(),
        messageId = f.chat.insertMessage(
          f.chat.session(f.session),
          'assistant',
          '待保存的确定文本',
          'final',
          null,
        );
      let entered!: () => void, release!: () => void;
      const writing = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        hold = new Promise<void>((resolve) => {
          release = resolve;
        });
      const original = BlobStore.prototype.put;
      const spy = vi.spyOn(BlobStore.prototype, 'put').mockImplementation(async function (
        this: BlobStore,
        ...args
      ) {
        entered();
        await hold;
        return original.apply(this, args);
      });
      try {
        const pending = f.history.dispatch(
          req('messages.saveNote', { sessionId: f.session, messageId }),
        );
        await writing;
        if (change === 'revision')
          f.store.db.prepare('UPDATE messages SET revision=revision+1 WHERE id=?').run(messageId);
        else {
          const project = newId(),
            now = f.store.now();
          f.store.db
            .prepare(
              'INSERT INTO projects(id,profile_id,created_at,updated_at,name) VALUES(?,?,?,?,?)',
            )
            .run(project, f.store.profileId, now, now, '异步范围改变');
          f.store.db.prepare('UPDATE sessions SET project_id=? WHERE id=?').run(project, f.session);
        }
        release();
        expect(await pending).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
        expect(
          new FileRepository(f.store, new BlobStore(f.store)).list({ source: 'generated' }).files,
        ).toEqual([]);
        expect(f.inputs).toEqual([]);
        expect(f.vault()).toBe(0);
      } finally {
        release();
        spy.mockRestore();
      }
    }
  });
  it('P03-01 generated message notes appear and search in the library and their pinned session/project after replacement and receipt replay', async () => {
    const f = await fresh(),
      blobs = new BlobStore(f.store),
      files = new FileRepository(f.store, blobs);
    const projectId = newId(),
      now = f.store.now();
    f.store.db
      .prepare('INSERT INTO projects(id,profile_id,created_at,updated_at,name) VALUES(?,?,?,?,?)')
      .run(projectId, f.store.profileId, now, now, '生成笔记项目');
    f.store.db.prepare('UPDATE sessions SET project_id=? WHERE id=?').run(projectId, f.session);
    const text = '生成正文唯一标记 <img src=x onerror=alert(1)>',
      messageId = f.chat.insertMessage(f.chat.session(f.session), 'assistant', text, 'final', null);
    const request = req('messages.saveNote', { sessionId: f.session, messageId, projectId });
    const saved = await f.history.dispatch(request);
    const id = (data(saved) as { entityId: string }).entityId;
    expect(await f.history.dispatch(request)).toEqual(saved);
    expect(
      files.list({ source: 'generated', query: '生成正文唯一标记' }).files.map((v) => v.id),
    ).toEqual([id]);
    const original = files.get(id),
      versionId = original.version.id;
    expect(original.version).toMatchObject({
      name: '收藏笔记.md',
      extension: 'md',
      parseStatus: 'ready',
      previewStatus: 'pending',
      parserVersion: null,
    });
    const replacement = await blobs.put(Buffer.from('replacement'), 'text/plain');
    files.importBlob({
      blobId: replacement.id,
      name: '新版本.txt',
      relativePath: '新版本.txt',
      owner: { type: 'library' },
      replaceId: id,
    });
    for (const owner of [
      { type: 'session' as const, id: f.session },
      { type: 'project' as const, id: projectId },
    ]) {
      expect(
        files
          .list({ owner, source: 'generated', query: '生成正文唯一标记' })
          .files.map((v) => v.id),
      ).toEqual([id]);
      expect(files.get(id, { owner }).version).toMatchObject({ id: versionId, extension: 'md' });
      expect((await files.original(id, { owner })).bytes.toString()).toBe(text);
    }
    expect(files.list({ query: '生成正文唯一标记' }).files).toEqual([]);
    expect(f.vault()).toBe(0);
    expect(f.inputs).toEqual([]);
  });
  it('T20 schema6 migration preserves messages, builds the index once and leaves a readable pre-migration backup', async () => {
    await mkdir('.test-data', { recursive: true });
    const dir = await mkdtemp(resolve('.test-data/P02-03 migration ')),
      backup = join(dir, 'backups'),
      db = new Database(':memory:');
    db.pragma('foreign_keys=ON');
    await migrate(db, backup, migrations.slice(0, 6));
    const store = new Store(db, dir);
    stores.push(store);
    const session = newId(),
      branch = newId(),
      id = newId();
    db.transaction(() => {
      db.prepare(
        "INSERT INTO sessions(id,profile_id,created_at,updated_at,title,mode,active_branch_id,settings_json,last_activity_at) VALUES(?,?,?,?,?,'chat',?,?,?)",
      ).run(
        session,
        store.profileId,
        1,
        1,
        '旧版会话',
        branch,
        JSON.stringify({ schemaVersion: 1, values: {} }),
        1,
      );
      db.prepare(
        'INSERT INTO branches(id,profile_id,created_at,updated_at,session_id,label) VALUES(?,?,?,?,?,?)',
      ).run(branch, store.profileId, 1, 1, session, '主分支');
    })();
    db.prepare(
      "INSERT INTO messages(id,profile_id,created_at,updated_at,session_id,branch_id,role,content_json,status) VALUES(?,?,?,?,?,?,'user',?,'final')",
    ).run(
      id,
      store.profileId,
      1,
      1,
      session,
      branch,
      JSON.stringify({ schemaVersion: 1, blocks: [{ type: 'text', text: '旧版索引标记' }] }),
    );
    await migrate(db, backup);
    await migrate(db, backup);
    expect(db.pragma('user_version', { simple: true })).toBe(11);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(
      db.prepare("SELECT count(*) n FROM history_fts WHERE history_fts MATCH '旧版索引标记'").get(),
    ).toEqual({ n: 1 });
    const filename = (await readdir(backup)).find((n) => n.startsWith('pre-migration-7-'))!;
    const old = new Database(join(backup, filename), { readonly: true });
    try {
      expect(old.pragma('user_version', { simple: true })).toBe(6);
      expect(old.prepare('SELECT content_json FROM messages WHERE id=?').get(id)).toEqual(
        db.prepare('SELECT content_json FROM messages WHERE id=?').get(id),
      );
    } finally {
      old.close();
    }
  });
  it('T20 batch move is atomic, global reorder preserves grouping, and entity/task lookup stays owned and precise', async () => {
    const f = await fresh();
    await f.send('任务定位唯一标记');
    const project = (
        data(f.core.dispatch(req('projects.create', { name: '项目定位' }))) as { entityId: string }
      ).entityId,
      section = (
        data(await f.history.dispatch(req('sidebar.create', { name: '顺序组' }))) as {
          entityId: string;
        }
      ).entityId;
    expect(
      await f.history.dispatch(
        req('sessions.move', {
          sessionIds: [f.session, newId()],
          projectId: project,
          sectionId: section,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await f.details()).session.projectId).toBeNull();
    data(
      await f.history.dispatch(
        req('sessions.move', { sessionIds: [f.session], projectId: project, sectionId: section }),
      ),
    );
    data(
      await f.history.dispatch(
        req('sidebar.reorder', { sectionId: null, ordered: [{ type: 'session', id: f.session }] }),
      ),
    );
    expect(
      SidebarViewSchema.parse(data(await f.history.dispatch(req('sidebar.list')))).sections[0]!
        .count,
    ).toBe(1);
    expect(
      data(await f.history.dispatch(req('search.locate', { type: 'project', id: project }))),
    ).toMatchObject({ id: project, name: '项目定位' });
    expect(
      await f.history.dispatch(req('search.locate', { type: 'project', id: newId() })),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const hit = SearchPageSchema.parse(
      data(
        await f.history.dispatch(
          req('search.query', {
            query: '任务定位唯一标记',
            scope: { type: 'all' },
            types: ['task'],
          }),
        ),
      ),
    ).hits[0]!;
    expect(hit.messageId).toBe((await f.snapshot()).messages[0]!.id);
    expect(hit.branchId).toBe((await f.snapshot()).branchId);
    const note = (
      data(
        await f.history.dispatch(
          req('messages.saveNote', {
            sessionId: f.session,
            messageId: (await f.snapshot()).messages.at(-1)!.id,
          }),
        ),
      ) as { entityId: string }
    ).entityId;
    expect(
      data(await f.history.dispatch(req('search.locate', { type: 'file', id: note }))),
    ).toMatchObject({ id: note, type: 'file' });
    expect(
      SearchPageSchema.parse(
        data(
          await f.history.dispatch(
            req('search.query', {
              query: '收藏笔记',
              scope: { type: 'file', id: note },
              types: ['file'],
            }),
          ),
        ),
      ).hits,
    ).toHaveLength(1);
  });
  it('T06 three-level edits and candidate switches preserve exact ancestor context without replaying old runs', async () => {
    const f = await fresh();
    await f.send('第一问题');
    await f.send('第二问题');
    const original = await f.snapshot(),
      firstUser = original.messages[0]!;
    const edit = BranchChangeSchema.parse(
      data(
        await f.history.dispatch(
          req(
            'messages.edit',
            { sessionId: f.session, messageId: firstUser.id, text: '修改后的第一问题' },
            (await f.details()).session.revision,
          ),
        ),
      ),
    );
    await expect.poll(async () => (await f.snapshot()).run?.status).toBe('completed');
    const edited = await f.snapshot();
    expect(edited.messages.map((m) => m.text).join(' ')).not.toContain('第二问题');
    expect(f.inputs.at(-1)!.messages.filter((m) => m.role === 'user')).toEqual([
      { role: 'user', text: '修改后的第一问题' },
    ]);
    const regen = BranchChangeSchema.parse(
      data(
        await f.history.dispatch(
          req(
            'messages.regenerate',
            { sessionId: f.session, messageId: edited.messages.at(-1)!.id },
            (await f.details()).session.revision,
          ),
        ),
      ),
    );
    await expect.poll(async () => (await f.snapshot()).run?.status).toBe('completed');
    const count = f.inputs.length;
    for (const branchId of [original.branchId, edit.branchId, regen.branchId])
      data(
        await f.history.dispatch(
          req(
            'messages.switchBranch',
            { sessionId: f.session, branchId },
            (await f.details()).session.revision,
          ),
        ),
      );
    expect(f.inputs).toHaveLength(count);
    expect((await f.details()).branches).toHaveLength(3);
    expect(
      f.store.db.prepare("SELECT count(*) n FROM runs WHERE status='completed'").get(),
    ).toEqual({ n: 4 });
    expect(
      await f.history.dispatch(
        req(
          'messages.switchBranch',
          { sessionId: f.session, branchId: newId() },
          (await f.details()).session.revision,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
  });
  it('T06 active generation rejects edit and branch switches, and revision conflicts preserve originals', async () => {
    const f = await fresh();
    await f.send('已有问题');
    const snap = await f.snapshot(),
      revision = (await f.details()).session.revision;
    expect(
      await f.history.dispatch(
        req(
          'messages.edit',
          { sessionId: f.session, messageId: snap.messages[0]!.id, text: '错版本' },
          revision - 1,
        ),
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    data(
      await f.chat.dispatch(
        req('messages.send', {
          sessionId: f.session,
          text: '慢速',
          attachments: [],
          clientMessageId: newId(),
          mode: 'chat',
        }),
      ),
    );
    expect(
      await f.history.dispatch(
        req('messages.switchBranch', { sessionId: f.session, branchId: snap.branchId }, revision),
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
  it('T06 delete preview matches branch suffix, keep-as-note removes model context, original copied branch stays readable', async () => {
    const f = await fresh();
    await f.send('删除标记甲');
    await f.send('后续乙');
    const original = await f.snapshot();
    await new BlobStore(f.store).backup(newId());
    const copy = BranchChangeSchema.parse(
      data(
        await f.history.dispatch(
          req('sessions.copy', { sessionId: f.session, includeAttachments: false }),
        ),
      ),
    );
    const preview = DeletePreviewSchema.parse(
      data(
        await f.history.dispatch(
          req('messages.deletePreview', {
            sessionId: f.session,
            messageId: original.messages[0]!.id,
          }),
        ),
      ),
    );
    expect(preview.laterCount).toBe(3);
    data(
      await f.history.dispatch(
        req(
          'messages.delete',
          {
            sessionId: f.session,
            messageId: original.messages[0]!.id,
            descendants: 'keep-as-note',
          },
          (await f.details()).session.revision,
        ),
      ),
    );
    await f.send('下一轮丙');
    expect(
      f.inputs
        .at(-1)!
        .messages.filter((m) => m.role === 'user')
        .some((m) => m.text.includes('删除标记甲')),
    ).toBe(false);
    expect((await f.snapshot(copy.sessionId)).messages[0]!.text).toBe('删除标记甲');
    await f.history.stop();
    await f.chat.stop();
    await f.models.stop();
    f.store.close();
    await writeFile(join(f.dir, 'db/app.sqlite'), 'P02-03 deleted node recovery');
    const restored = await openStore(f.dir);
    stores.push(restored);
    const node = restored.db
      .prepare('SELECT role,content_json FROM messages WHERE id=?')
      .get(original.messages[0]!.id) as { role: string; content_json: string };
    expect(node.role).toBe('system_note');
    expect(node.content_json).not.toContain('删除标记甲');
    expect(
      restored.db
        .prepare("SELECT body FROM history_search_documents WHERE entity_type='task'")
        .all()
        .some((r) => JSON.stringify(r).includes('删除标记甲')),
    ).toBe(false);
  });
  it('T10 Chinese trigram search filters project scope and profiles, finds archived message and checks cursor filters', async () => {
    const f = await fresh();
    const project = (
      data(f.core.dispatch(req('projects.create', { name: '权限项目' }))) as { entityId: string }
    ).entityId;
    data(
      await f.history.dispatch(
        req(
          'sessions.update',
          { sessionId: f.session, patch: { projectId: project } },
          (await f.details()).session.revision,
        ),
      ),
    );
    await f.send('中文搜索唯一片段');
    data(await f.history.dispatch(req('sessions.archive', { sessionIds: [f.session] })));
    const query = {
      query: '唯一片段',
      scope: { type: 'project', id: project },
      types: ['message'],
    };
    const hits = SearchPageSchema.parse(data(await f.history.dispatch(req('search.query', query))));
    expect(hits.hits).toHaveLength(2);
    expect(hits.hits[0]!.messageId).toBeTruthy();
    expect(hits.hits[0]!.ranges.length).toBeGreaterThan(0);
    expect(
      SearchPageSchema.parse(
        data(await f.history.dispatch(req('search.query', { ...query, archived: false }))),
      ).hits,
    ).toHaveLength(0);
    expect(
      await f.history.dispatch(
        req('search.query', { ...query, scope: { type: 'project', id: newId() } }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    expect(
      await f.history.dispatch(req('search.query', { query: '中文', scope: { type: 'all' } })),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(
      SearchPageSchema.parse(
        data(
          await f.history.dispatch(
            req('search.query', { query: '中文', scope: { type: 'session', id: f.session } }),
          ),
        ),
      ).hits.length,
    ).toBeGreaterThan(0);
    const page = SearchPageSchema.parse(
      data(await f.history.dispatch(req('search.query', { ...query, limit: 1 }))),
    );
    expect(page.nextCursor).toBeTruthy();
    expect(
      await f.history.dispatch(
        req('search.query', { ...query, query: '另一查询', limit: 1, cursor: page.nextCursor }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
  it('T10 search pages preserve tie ordering and reject stale deleted, missing and foreign-profile index entries', async () => {
    const f = await fresh();
    const createSession = () =>
      (
        data(f.core.dispatch(req('sessions.create', { mode: 'chat', title: '索引边界' }))) as {
          entityId: string;
        }
      ).entityId;
    const archived = createSession(),
      deleted = createSession();
    data(await f.history.dispatch(req('sessions.archive', { sessionIds: [archived] })));
    data(await f.history.dispatch(req('sessions.trash', { sessionIds: [deleted] })));
    const now = f.store.now(),
      file = newId(),
      deletedFile = newId();
    const insertFile = f.store.db.prepare(
      "INSERT INTO files(id,profile_id,created_at,updated_at,deleted_at,display_name,extension,mime,kind,status,source_type) VALUES(?,?,?,?,?,'合成文件','txt','text/plain','input','ready','import')",
    );
    insertFile.run(file, f.store.profileId, now, now, null);
    insertFile.run(deletedFile, f.store.profileId, now, now, now);
    const project = (
      data(f.core.dispatch(req('projects.create', { name: '合成索引项目' }))) as {
        entityId: string;
      }
    ).entityId;
    const insert = f.store.db.prepare(
      'INSERT INTO history_search_documents(entity_id,entity_type,profile_id,session_id,title,body,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_id,entity_type) DO UPDATE SET profile_id=excluded.profile_id,session_id=excluded.session_id,title=excluded.title,body=excluded.body,updated_at=excluded.updated_at',
    );
    const indexed = (
      type: string,
      session: string | null,
      profile = f.store.profileId,
      id = newId(),
    ) => {
      insert.run(id, type, profile, session, '合成索引', '排序标记', now);
      return id;
    };
    const visible = Array.from({ length: 8 }, () => indexed('message', f.session));
    visible.push(
      indexed('project', null, f.store.profileId, project),
      indexed('file', null, f.store.profileId, file),
    );
    const archivedId = indexed('message', archived);
    // Simulate stale index rows surviving deletion/recovery; the search route
    // must enforce current entity visibility before LIMIT/OFFSET pagination.
    indexed('message', deleted);
    indexed('message', newId());
    indexed('message', f.session, newId());
    indexed('file', null, f.store.profileId, deletedFile);
    for (const sort of ['updated', 'relevance'] as const)
      for (const includeArchived of [false, true]) {
        const ids: string[] = [];
        let cursor: string | undefined;
        do {
          const page = SearchPageSchema.parse(
            data(
              await f.history.dispatch(
                req('search.query', {
                  query: '排序标记',
                  scope: { type: 'all' },
                  types: ['message', 'project', 'file'],
                  sort,
                  archived: includeArchived,
                  limit: 3,
                  ...(cursor ? { cursor } : {}),
                }),
              ),
            ),
          );
          ids.push(...page.hits.map((hit) => hit.id));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        expect(ids).toEqual([...visible, ...(includeArchived ? [archivedId] : [])].sort());
      }
    const scoped = SearchPageSchema.parse(
      data(
        await f.history.dispatch(
          req('search.query', { query: '排序', scope: { type: 'session', id: f.session } }),
        ),
      ),
    );
    expect(scoped.hits.map((hit) => hit.id)).toEqual(visible.slice(0, 8).sort());
  });
  it('T10 relevance fills every page when the best score group is outside the allowed archive or session scope', async () => {
    const f = await fresh();
    const archived = (
      data(f.core.dispatch(req('sessions.create', { mode: 'chat', title: '归档候选' }))) as {
        entityId: string;
      }
    ).entityId;
    data(await f.history.dispatch(req('sessions.archive', { sessionIds: [archived] })));
    const insert = f.store.db.prepare(
      "INSERT INTO history_search_documents(entity_id,entity_type,profile_id,session_id,title,body,updated_at) VALUES(?,'message',?,?,'合成索引',?,?)",
    );
    const low: string[] = [],
      high: string[] = [];
    for (let i = 0; i < 8; i++) {
      const id = newId();
      low.push(id);
      insert.run(
        id,
        f.store.profileId,
        f.session,
        '排名标记 ' + '普通内容'.repeat(40),
        f.store.now(),
      );
    }
    for (let i = 0; i < 100; i++) {
      const id = newId();
      high.push(id);
      insert.run(id, f.store.profileId, archived, '排名标记', f.store.now());
    }
    const query = { query: '排名标记', types: ['message'], sort: 'relevance', limit: 3 };
    const all = SearchPageSchema.parse(
      data(await f.history.dispatch(req('search.query', { ...query, scope: { type: 'all' } }))),
    );
    expect(all.hits.map((hit) => hit.id)).toEqual(high.sort().slice(0, 3));
    for (const scope of [{ type: 'all' }, { type: 'session', id: f.session }]) {
      let cursor: string | undefined;
      const ids: string[] = [];
      do {
        const page = SearchPageSchema.parse(
          data(
            await f.history.dispatch(
              req('search.query', {
                ...query,
                scope,
                archived: false,
                ...(cursor ? { cursor } : {}),
              }),
            ),
          ),
        );
        ids.push(...page.hits.map((hit) => hit.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(ids).toEqual([...low].sort());
    }
    const empty = SearchPageSchema.parse(
      data(
        await f.history.dispatch(
          req('search.query', { ...query, query: '没有命中结果', scope: { type: 'all' } }),
        ),
      ),
    );
    expect(empty).toEqual({ hits: [], nextCursor: null });
  });
  it('T20 organization grouping, reorder, bookmarks, restore and deletion of a group keep all sessions', async () => {
    const f = await fresh();
    await f.send('分组问题');
    const section = (
      data(await f.history.dispatch(req('sidebar.create', { name: '研发' }))) as {
        entityId: string;
      }
    ).entityId;
    data(
      await f.history.dispatch(
        req('sidebar.move', { entity: { type: 'session', id: f.session }, sectionId: section }),
      ),
    );
    expect(
      SidebarViewSchema.parse(data(await f.history.dispatch(req('sidebar.list')))).sections[0],
    ).toMatchObject({ name: '研发', count: 1 });
    data(await f.history.dispatch(req('sidebar.remove', { sectionId: section }, 1)));
    expect((await f.details()).session.title).toBe('组织中文测试');
    const m = (await f.snapshot()).messages.at(-1)!;
    data(
      await f.history.dispatch(
        req('messages.mark', {
          sessionId: f.session,
          messageId: m.id,
          bookmark: true,
          rating: 'up',
          note: '本地反馈',
          report: true,
        }),
      ),
    );
    expect((await f.details()).marks[0]).toMatchObject({
      bookmark: true,
      rating: 'up',
      report: true,
    });
    data(await f.history.dispatch(req('sessions.trash', { sessionIds: [f.session] })));
    expect(
      SessionPageSchema.parse(
        data(await f.history.dispatch(req('sessions.list', { state: 'trash' }))),
      ).sessions,
    ).toHaveLength(1);
    data(await f.history.dispatch(req('sessions.restore', { sessionIds: [f.session] })));
    expect((await f.snapshot()).messages).toHaveLength(2);
    expect(
      SearchPageSchema.parse(
        data(
          await f.history.dispatch(
            req('search.query', { query: '分组问题', scope: { type: 'all' }, types: ['message'] }),
          ),
        ),
      ).hits,
    ).toHaveLength(2);
  });
  it('T20 permanent deletion masks drafts/messages/index and old backup cannot resurrect a session', async () => {
    const f = await fresh();
    await f.send('永久删除唯一标记');
    data(
      await f.chat.dispatch(
        req(
          'drafts.save',
          { sessionId: f.session, windowId: '0', text: '永久删除草稿', attachments: [] },
          1,
        ),
      ),
    );
    const backup = newId();
    await new BlobStore(f.store).backup(backup);
    data(await f.history.dispatch(req('sessions.trash', { sessionIds: [f.session] })));
    data(await f.history.dispatch(req('sessions.purge', { sessionIds: [f.session] })));
    expect(
      f.store.db.prepare('SELECT text FROM drafts WHERE session_id=?').all(f.session),
    ).toHaveLength(0);
    expect(
      f.store.db.prepare('SELECT * FROM history_fts WHERE session_id=?').all(f.session),
    ).toHaveLength(0);
    expect(
      await f.history.dispatch(req('sessions.restore', { sessionIds: [f.session] })),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(
      SessionPageSchema.parse(
        data(await f.history.dispatch(req('sessions.list', { state: 'trash' }))),
      ).sessions,
    ).toHaveLength(0);
    expect(await readFile(join(f.dir, 'db/deletions.jsonl'), 'utf8')).toContain('session');
    expect(
      f.store.db
        .prepare('SELECT content_json FROM messages WHERE session_id=?')
        .all(f.session)
        .every((r) => !JSON.stringify(r).includes('唯一标记')),
    ).toBe(true);
    await f.history.stop();
    await f.chat.stop();
    await f.models.stop();
    f.store.close();
    await writeFile(join(f.dir, 'db/app.sqlite'), 'P02-03 corrupt fixture');
    const restored = await openStore(f.dir);
    stores.push(restored);
    expect(
      restored.db
        .prepare('SELECT entity_type FROM deletion_tombstones WHERE entity_id=?')
        .get(f.session),
    ).toEqual({ entity_type: 'session' });
    expect(
      restored.db.prepare('SELECT * FROM history_fts WHERE session_id=?').all(f.session),
    ).toHaveLength(0);
    expect(
      JSON.stringify(
        restored.db
          .prepare('SELECT content_json,chat_json FROM messages WHERE session_id=?')
          .all(f.session),
      ),
    ).not.toContain('唯一标记');
    expect(
      JSON.stringify(restored.db.prepare('SELECT public_text FROM provider_attempts').all()),
    ).not.toContain('唯一标记');
  });
  it('T06 title jobs have one request and manual rename wins a job race', async () => {
    const f = await fresh(),
      run = await f.send('标题后台问题');
    f.history.queueTitle(f.session, run.runId!);
    let release!: (value: string) => void;
    f.chat.generateTitle = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const running = f.history.titles();
    await expect.poll(() => !!release).toBe(true);
    data(
      await f.history.dispatch(
        req(
          'sessions.update',
          { sessionId: f.session, patch: { title: '我的手工标题' } },
          (await f.details()).session.revision,
        ),
      ),
    );
    release('旧自动标题');
    await running;
    expect((await f.details()).session.title).toBe('我的手工标题');
    f.history.queueTitle(f.session, run.runId!);
    await f.history.titles();
    expect(f.store.db.prepare('SELECT count(*) n FROM title_jobs').get()).toEqual({ n: 1 });
  });
  it('T20 purge cannot race a running title request, including a job cancelled by manual rename', async () => {
    const f = await fresh(),
      run = await f.send('标题清理竞态');
    f.history.queueTitle(f.session, run.runId!);
    let release!: (v: string) => void;
    f.chat.generateTitle = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const running = f.history.titles();
    await expect.poll(() => !!release).toBe(true);
    data(
      await f.history.dispatch(
        req(
          'sessions.update',
          { sessionId: f.session, patch: { title: '人工标题' } },
          (await f.details()).session.revision,
        ),
      ),
    );
    data(await f.history.dispatch(req('sessions.trash', { sessionIds: [f.session] })));
    expect(
      await f.history.dispatch(req('sessions.purge', { sessionIds: [f.session] })),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    release('过期标题');
    await running;
    data(await f.history.dispatch(req('sessions.purge', { sessionIds: [f.session] })));
    expect(
      f.store.db.prepare('SELECT count(*) n FROM history_fts WHERE session_id=?').get(f.session),
    ).toEqual({ n: 0 });
  });
  it('T10 moving into a project changes only new model instructions and old source stays visible', async () => {
    const f = await fresh();
    await f.send('项目外旧问题');
    const project = (
      data(f.core.dispatch(req('projects.create', { name: '新项目' }))) as { entityId: string }
    ).entityId;
    f.store.db
      .prepare('UPDATE projects SET instructions=? WHERE id=?')
      .run('项目内明确规则', project);
    data(
      await f.history.dispatch(
        req(
          'sessions.update',
          { sessionId: f.session, patch: { projectId: project } },
          (await f.details()).session.revision,
        ),
      ),
    );
    await f.send('项目内新问题');
    expect(f.inputs.at(-1)!.systemModules).toContainEqual({
      id: 'project.instructions',
      text: '项目内明确规则',
    });
    expect(f.inputs.at(-1)!.systemModules.some((s) => s.id === 'personal.instructions')).toBe(
      false,
    );
    expect(
      f.store.db.prepare("SELECT * FROM resource_links WHERE owner_type='project'").all(),
    ).toHaveLength(0);
    expect((await f.snapshot()).messages[0]!.sourceProjectId).toBeNull();
    expect((await f.snapshot()).messages.at(-1)!.sourceProjectId).toBe(project);
  });
  it('T06 title rate limiting makes exactly one request with no retry or second job', async () => {
    const f = await fresh(),
      run = await f.send('后台命名问题');
    let calls = 0;
    const adapter = f.models.router.deps.adapter;
    f.models.router.deps.adapter = (id) => ({
      ...adapter(id),
      async *stream() {
        calls++;
        yield {
          type: 'error',
          partial: false,
          error: { code: 'RATE_LIMITED', retryable: true, retryAfterMs: 0 },
        };
      },
    });
    f.history.queueTitle(f.session, run.runId!);
    await f.history.titles();
    f.history.queueTitle(f.session, run.runId!);
    await f.history.titles();
    expect(calls).toBe(1);
    expect(f.store.db.prepare('SELECT status FROM title_jobs').get()).toEqual({ status: 'failed' });
  });
  it('T10 closing a temporary chat retains only numeric daily charges and cannot bypass the profile ceiling', async () => {
    const f = await fresh(),
      temporary = new TemporaryService(f.store, f.models, f.providers, (target) => {
        target.catalog = f.models.catalog;
        target.router.deps.adapter = f.models.router.deps.adapter;
      });
    temps.push(temporary);
    const create = async () =>
      BranchChangeSchema.parse(
        data(await temporary.dispatch(req('sessions.temporary', {}, undefined, '0'))),
      );
    const send = async (sessionId: string) =>
      data(
        await temporary.dispatch(
          req(
            'messages.send',
            {
              sessionId,
              text: '临时预算问题',
              attachments: [],
              clientMessageId: newId(),
              mode: 'chat',
            },
            undefined,
            '0',
          ),
        ),
      );
    const state = async (sessionId: string) =>
      ChatSnapshotSchema.parse(
        data(await temporary.dispatch(req('messages.list', { sessionId }, undefined, '0'))),
      );
    const first = await create();
    await send(first.sessionId);
    await expect.poll(async () => (await state(first.sessionId)).run?.status).toBe('completed');
    await temporary.closeWindow('0');
    expect(
      f.store.db
        .prepare("SELECT used_tokens,reserved_tokens FROM budgets WHERE owner_kind='daily'")
        .get(),
    ).toEqual({ used_tokens: 60, reserved_tokens: 0 });
    expect(f.store.db.prepare('SELECT count(*) n FROM usage_ledger').get()).toEqual({ n: 0 });
    const scope = { type: 'profile' as const, id: f.store.profileId },
      p = f.models.ledger.preferences(scope);
    f.store.db.transaction(() =>
      f.models.ledger.setPreferences(scope, { ...p.values, dailyTokenLimit: 60 }, p.revision),
    )();
    const second = await create();
    await send(second.sessionId);
    await expect
      .poll(async () => (await state(second.sessionId)).run?.status)
      .toBe('budget_stopped');
    expect(f.inputs).toHaveLength(1);
  });
  it('T10 temporary text, attachment, protocol state and ledger stay in memory; owner window only and close clears everything', async () => {
    const f = await fresh(),
      temporary = new TemporaryService(f.store, f.models, f.providers, (target) => {
        target.catalog = f.models.catalog;
        target.router.deps.adapter = f.models.router.deps.adapter;
      });
    temps.push(temporary);
    const temp = BranchChangeSchema.parse(
      data(await temporary.dispatch(req('sessions.temporary', {}, undefined, '0'))),
    );
    const marker = '临时正文唯一标记';
    expect(
      await temporary.dispatch(
        req('drafts.get', { sessionId: temp.sessionId, windowId: '1' }, undefined, '1'),
      ),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    data(
      await temporary.dispatch(
        req(
          'drafts.save',
          { sessionId: temp.sessionId, windowId: '0', text: marker, attachments: [] },
          1,
          '0',
        ),
      ),
    );
    data(
      await temporary.dispatch(
        req(
          'inputs.attach',
          {
            sessionId: temp.sessionId,
            name: '临时附件.txt',
            bytes: Buffer.from(marker).toString('base64'),
          },
          undefined,
          '0',
        ),
      ),
    );
    data(
      await temporary.dispatch(
        req(
          'messages.send',
          {
            sessionId: temp.sessionId,
            text: marker,
            attachments: [],
            clientMessageId: newId(),
            mode: 'chat',
          },
          undefined,
          '0',
        ),
      ),
    );
    await expect
      .poll(async () => {
        const snap = ChatSnapshotSchema.parse(
          data(
            await temporary.dispatch(
              req('messages.list', { sessionId: temp.sessionId }, undefined, '0'),
            ),
          ),
        );
        return snap.run?.status;
      })
      .toBe('completed');
    expect(
      f.store.db.prepare('SELECT * FROM sessions WHERE id=?').get(temp.sessionId),
    ).toBeUndefined();
    expect(f.store.db.prepare('SELECT count(*) n FROM usage_ledger').get()).toEqual({ n: 0 });
    expect(
      await temporary.dispatch(
        req('search.query', { query: marker, scope: { type: 'all' } }, undefined, '0'),
      ),
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } });
    await temporary.closeWindow('0');
    expect(temporary.owns(temp.sessionId)).toBe(false);
    expect(f.vault()).toBe(0);
    const bytes = await readFile(join(f.dir, 'db/app.sqlite'));
    expect(bytes.includes(Buffer.from(marker))).toBe(false);
    expect(await readdir(f.dir)).not.toContain('tmp');
  });
});
