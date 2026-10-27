import { test, expect, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, lstat, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  openStore,
  BlobStore,
  FileRepository,
  JobQueue,
  newId,
  migrate,
  migrations,
} from '../../packages/storage/src';
import { createRequire } from 'node:module';
import { CoreService } from '../../packages/core/src/service';
import { ChatService } from '../../packages/core/src/chat-service';
import { WebService } from '../../packages/core/src/web-service';
import { ExportService } from '../../packages/core/src/export-service';
import { writeExportTarget } from '../../packages/core/src/export-target';
test('P05-02 T19 cancellation during writing removes owned partial copy and rejects a junction parent', async () => {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P05-02 destination '));
  const signal = new AbortController(),
    target = join(dir, 'partial.txt');
  let checks = 0;
  await expect(
    writeExportTarget(
      target,
      Buffer.alloc(900000),
      signal.signal,
      () => {},
      () => {
        if (++checks === 2) signal.abort();
        signal.signal.throwIfAborted();
      },
    ),
  ).rejects.toThrow();
  await expect(lstat(target)).rejects.toThrow();
  const link = join(dir, 'junction');
  await symlink(dir, link, 'junction');
  await expect(
    writeExportTarget(
      join(link, 'refused.txt'),
      Buffer.from('x'),
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow('PERMISSION_DENIED');
  await expect(lstat(join(dir, 'refused.txt'))).rejects.toThrow();
});
import { WebTools } from '../../packages/tools/src/web';
import { NetworkPolicyService } from '../../packages/network/src';
import { DEFAULT_MODEL_PREFERENCES, ExportOptionsSchema } from '../../packages/contracts/src';
test('P05-02 T20 replaced, consumed and expired previews cannot be reused; closing a window cancels its queued grant', async () => {
  const f = await fixture();
  try {
    const old = await f.preview(),
      current = await f.preview();
    expect(() => f.service.getPreview('1', old.previewId, old.snapshotVersion)).toThrow('CONFLICT');
    vi.setSystemTime(Date.now() + 31 * 60000);
    expect(() => f.service.getPreview('1', current.previewId, current.snapshotVersion)).toThrow(
      'CONFLICT',
    );
    const fresh = await f.preview({ format: 'txt' });
    const queued = await f.service.write(
      '1',
      fresh.previewId,
      fresh.snapshotVersion,
      join(f.dir, 'closed.txt'),
    );
    expect(() => f.service.getPreview('1', fresh.previewId, fresh.snapshotVersion)).toThrow(
      'CONFLICT',
    );
    f.service.closeWindow('1');
    expect(f.service.status(queued.exportId).state).toBe('cancelled');
    await expect(lstat(join(f.dir, 'closed.txt'))).rejects.toThrow();
  } finally {
    f.store.close();
  }
});
test('P05-02 T20 a PDF completing after cancellation cannot create a late copy', async () => {
  const f = await fixture();
  try {
    let start!: () => void, finish!: (value: Buffer) => void;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const pdf = new Promise<Buffer>((resolve) => {
      finish = resolve;
    });
    const service = new ExportService(
      f.store,
      f.blobs,
      f.chat,
      f.web,
      async () => {
        start();
        return pdf;
      },
      async () => '',
    );
    const preview = await service.preview(
      req('exports.preview', {}),
      { kind: 'session', sessionId: f.sid },
      ExportOptionsSchema.parse({ format: 'pdf' }),
    );
    const path = join(f.dir, 'late.pdf'),
      status = await service.write('1', preview.previewId, preview.snapshotVersion, path),
      job = f.queue.claim(newId())!;
    const executing = service.execute(job, new AbortController().signal);
    await started;
    f.queue.cancel(job.id);
    finish(Buffer.from('%PDF-late-synthetic'));
    await expect(executing).rejects.toThrow('CANCELLED');
    expect(service.status(status.exportId).state).toBe('cancelled');
    await expect(lstat(path)).rejects.toThrow();
  } finally {
    f.store.close();
  }
});
test('P05-02 T20 public process summary excludes arbitrary tool names/arguments and records the actual chosen filename', async () => {
  const f = await fixture();
  try {
    const run = f.store.db.transaction(() =>
      f.chat.createRun(f.chat.session(f.sid), f.user, null),
    )();
    f.store.db.prepare("UPDATE runs SET status='completed' WHERE id=?").run(run);
    for (const name of ['web.read', 'PRIVATE_MEMORY_BODY sk-synthetic-process-secret']) {
      const id = newId();
      f.store.db
        .prepare(
          "INSERT INTO tool_calls(id,profile_id,created_at,updated_at,run_id,task_version,call_id,tool_name,tool_version,args_json,args_hash,resource_hash,idempotency_key,status,side_effect) VALUES(?,?,0,0,?,1,?,?,'1','{\"private\":\"PRIVATE_NATIVE_STATE\"}',?, ?,?,'failed','none')",
        )
        .run(id, f.store.profileId, run, newId(), name, '0'.repeat(64), '0'.repeat(64), id);
    }
    const preview = await f.preview({ format: 'txt', includeProcess: true });
    expect(preview.text).toContain('读取公开网页 · 失败');
    expect(preview.text).toContain('未识别工具 · 失败');
    for (const value of [
      'PRIVATE_MEMORY_BODY',
      'PRIVATE_NATIVE_STATE',
      'sk-synthetic-process-secret',
    ])
      expect(preview.text).not.toContain(value);
    const status = await f.run(
      preview.previewId,
      preview.snapshotVersion,
      join(f.dir, '实际选择名称.txt'),
    );
    expect(status.name).toBe('实际选择名称.txt');
  } finally {
    f.store.close();
  }
});
const req = (command: string, payload: unknown) => ({
  protocolVersion: 1 as const,
  requestId: newId(),
  windowId: '1',
  command,
  payload,
});
async function fixture() {
  await mkdir('.test-data', { recursive: true });
  const dir = await mkdtemp(resolve('.test-data', 'P05-02 synthetic '));
  const store = await openStore(dir),
    blobs = new BlobStore(store),
    core = new CoreService(store);
  const models = {
    catalog: async () => [],
    effective: () => ({ values: DEFAULT_MODEL_PREFERENCES, scope: 'profile' as const }),
    ledger: { hasPreferences: () => false },
    router: { async *stream() {} },
  };
  const chat = new ChatService(store, blobs, models),
    web = new WebService(store, blobs, new WebTools(new NetworkPolicyService()));
  const service = new ExportService(
    store,
    blobs,
    chat,
    web,
    async () => Buffer.from('%PDF-synthetic fixture'),
    async () => '',
  );
  const created = core.dispatch(req('sessions.create', { mode: 'chat', title: '中文分享' }));
  if (!created.ok || !('entityId' in created.data)) throw Error('session');
  const sid = created.data.entityId;
  const user = chat.insertMessage(
    chat.session(sid),
    'user',
    '分享正文，api_key=sk-synthetic-private-token\nC:\\Users\\Synthetic\\secret.txt',
    'final',
    null,
  );
  chat.insertMessage(
    chat.session(sid),
    'assistant',
    '|项目|金额|\n|---|---|\n|中文|42|\n\n```text\n    缩进代码\n```',
    'final',
    null,
  );
  chat.insertMessage(
    chat.session(sid),
    'tool',
    'PRIVATE_TOOL_TOKEN PRIVATE_MEMORY_BODY',
    'final',
    null,
  );
  const queue = new JobQueue(store);
  const preview = (options: object = {}, target = { kind: 'session' as const, sessionId: sid }) =>
    service.preview(req('exports.preview', {}), target, ExportOptionsSchema.parse(options));
  const run = async (previewId: string, version: string, path: string) => {
    const status = await service.write('1', previewId, version, path),
      job = queue.claim(newId())!;
    expect(job.kind).toBe('snapshot.export');
    try {
      const result = await service.execute(job, new AbortController().signal);
      queue.finish(job, 'completed', result);
    } catch (error) {
      queue.finish(job, 'failed');
      throw error;
    }
    return service.status(status.exportId);
  };
  return { dir, store, blobs, core, chat, web, service, sid, user, queue, preview, run };
}
test('P05-02 T20 MD/TXT/HTML/ZIP copies contain previewed data, exclude tools/private data and survive source deletion', async () => {
  const f = await fixture();
  try {
    for (const format of ['md', 'txt', 'html', 'zip'] as const) {
      const p = await f.preview({ format });
      for (const forbidden of [
        'PRIVATE_TOOL_TOKEN',
        'PRIVATE_MEMORY_BODY',
        'sk-synthetic-private-token',
        'C:\\Users',
      ])
        expect(p.text).not.toContain(forbidden);
      const path = join(f.dir, '分享.' + format),
        status = await f.run(p.previewId, p.snapshotVersion, path);
      expect(status).toMatchObject({ state: 'completed', progress: 100 });
      expect((await readFile(path)).length).toBeGreaterThan(10);
      if (format !== 'zip') expect((await readFile(path)).toString()).toContain('中文');
    }
    f.store.db.prepare('UPDATE sessions SET deleted_at=? WHERE id=?').run(Date.now(), f.sid);
    expect((await readFile(join(f.dir, '分享.html'))).toString()).toContain('中文');
  } finally {
    f.store.close();
  }
});
test('P05-02 T20 preview is window-bound, immutable and cannot overwrite existing targets', async () => {
  const f = await fixture();
  try {
    const p = await f.preview({ format: 'txt' });
    expect(() => f.service.getPreview('2', p.previewId, p.snapshotVersion)).toThrow('CONFLICT');
    expect(() => f.service.getPreview('1', p.previewId, '0'.repeat(64))).toThrow('CONFLICT');
    f.store.db.prepare('UPDATE messages SET revision=revision+1 WHERE id=?').run(f.user);
    await expect(
      f.service.write('1', p.previewId, p.snapshotVersion, join(f.dir, 'stale.txt')),
    ).rejects.toThrow('CONFLICT');
    const next = await f.preview({ format: 'txt' }),
      path = join(f.dir, 'existing.txt');
    await writeFile(path, 'KEEP ORIGINAL');
    await expect(f.run(next.previewId, next.snapshotVersion, path)).rejects.toThrow('CONFLICT');
    expect((await readFile(path)).toString()).toBe('KEEP ORIGINAL');
    await expect(
      f
        .preview({ format: 'txt' })
        .then((fresh) =>
          f.service.write('1', fresh.previewId, fresh.snapshotVersion, join(f.dir, 'wrong.pdf')),
        ),
    ).rejects.toThrow('VALIDATION_ERROR');
  } finally {
    f.store.close();
  }
});
test('P05-02 T07 chosen historical file bytes and relative folders are fixed; excluded attachments are absent', async () => {
  const f = await fixture();
  try {
    const repository = new FileRepository(f.store, f.blobs),
      blob = await f.blobs.put(Buffer.from('OLD FIXED BYTES'), 'text/plain');
    const original = repository.importBlob({
      blobId: blob.id,
      name: '原件.txt',
      relativePath: '资料/原件.txt',
      owner: { type: 'session', id: f.sid },
    }).file;
    f.store.db.prepare("UPDATE jobs SET status='cancelled' WHERE kind='file.parse'").run();
    f.store.db.prepare('UPDATE messages SET chat_json=? WHERE id=?').run(
      JSON.stringify({
        attachments: [{ kind: 'file', fileId: original.id, versionId: original.version.id }],
      }),
      f.user,
    );
    const excluded = await f.preview({ format: 'zip', includeAttachments: false });
    expect(excluded.fileNames).toEqual([]);
    const included = await f.preview({ format: 'zip', includeAttachments: true });
    expect(included.fileNames).toEqual(['资料/原件.txt']);
    const path = join(f.dir, '附件.zip');
    await f.run(included.previewId, included.snapshotVersion, path);
    const bytes = await readFile(path);
    expect(bytes.includes(Buffer.from('OLD FIXED BYTES'))).toBe(true);
    expect(bytes.includes(Buffer.from('资料/原件.txt'))).toBe(true);
  } finally {
    f.store.close();
  }
});
test('P05-02 T20 cancelled/stale jobs do not write late results; restart records a failed recoverable export', async () => {
  const f = await fixture();
  try {
    const p = await f.preview({ format: 'txt' }),
      path = join(f.dir, 'cancelled.txt'),
      status = await f.service.write('1', p.previewId, p.snapshotVersion, path),
      job = f.queue.claim(newId())!;
    f.queue.cancel(job.id);
    await expect(f.service.execute(job, new AbortController().signal)).rejects.toThrow('CANCELLED');
    expect(f.service.status(status.exportId).state).toBe('cancelled');
    await expect(lstat(path)).rejects.toThrow();
    const next = await f.preview({ format: 'txt' }),
      interrupted = await f.service.write(
        '1',
        next.previewId,
        next.snapshotVersion,
        join(f.dir, 'restart.txt'),
      );
    const restarted = new ExportService(
      f.store,
      f.blobs,
      f.chat,
      f.web,
      async () => Buffer.from('%PDF-'),
      async () => '',
    );
    expect(restarted.status(interrupted.exportId)).toMatchObject({
      state: 'failed',
      errorCode: 'STREAM_INTERRUPTED',
    });
    const writing = await f.preview({ format: 'txt' }),
      possible = join(f.dir, 'possibly-saved.txt');
    const uncertain = await f.service.write(
      '1',
      writing.previewId,
      writing.snapshotVersion,
      possible,
    );
    f.queue.claim(newId());
    f.store.db.prepare('UPDATE exports SET progress=85 WHERE id=?').run(uncertain.exportId);
    await writeFile(possible, 'A COPY MAY ALREADY EXIST');
    const recovered = new ExportService(
      f.store,
      f.blobs,
      f.chat,
      f.web,
      async () => Buffer.from('%PDF-'),
      async () => '',
    );
    expect(recovered.status(uncertain.exportId)).toMatchObject({
      state: 'failed',
      errorCode: 'SIDE_EFFECT_UNKNOWN',
    });
    expect(await readFile(possible, 'utf8')).toBe('A COPY MAY ALREADY EXIST');
    const cancelling = await f.preview({ format: 'txt' });
    const stopped = await f.service.write(
      '1',
      cancelling.previewId,
      cancelling.snapshotVersion,
      join(f.dir, 'cancelled-at-crash.txt'),
    );
    const active = f.queue.claim(newId())!;
    f.queue.cancel(active.id);
    f.store.db.prepare('UPDATE exports SET progress=85 WHERE id=?').run(stopped.exportId);
    const restartedAgain = new ExportService(
      f.store,
      f.blobs,
      f.chat,
      f.web,
      async () => Buffer.from('%PDF-'),
      async () => '',
    );
    expect(restartedAgain.status(stopped.exportId)).toMatchObject({
      state: 'cancelled',
      errorCode: 'SIDE_EFFECT_UNKNOWN',
    });
  } finally {
    f.store.close();
  }
});
test('P05-02 T20 selected messages exclude other branches; expired previews and forged metadata cannot be used', async () => {
  const f = await fixture();
  try {
    const p = await f.service.preview(
      req('exports.preview', {}),
      { kind: 'session', sessionId: f.sid, messageIds: [f.user] },
      ExportOptionsSchema.parse({ format: 'txt' }),
    );
    expect(p.messages.map((m) => m.id)).toEqual([f.user]);
    expect(p.text).not.toContain('缩进代码');
    await expect(
      f.service.preview(
        req('exports.preview', {}),
        { kind: 'session', sessionId: f.sid, messageIds: [newId()] },
        ExportOptionsSchema.parse({}),
      ),
    ).rejects.toThrow('PERMISSION_DENIED');
    f.store.db.prepare('UPDATE sessions SET deleted_at=? WHERE id=?').run(Date.now(), f.sid);
    await expect(
      f.service.write('1', p.previewId, p.snapshotVersion, join(f.dir, 'removed.txt')),
    ).rejects.toThrow('NOT_FOUND');
  } finally {
    f.store.close();
  }
});
test('P05-02 T20 schema15 migration preserves queue rows and dependent memory candidate references', async () => {
  const f = await fixture();
  try {
    const Database = createRequire(import.meta.url)(
      'better-sqlite3',
    ) as typeof import('better-sqlite3');
    const db = new Database(':memory:');
    db.pragma('foreign_keys=ON');
    for (const step of migrations.filter((m) => m.version <= 15)) db.exec(step.sql);
    const profile = f.store.db.prepare('SELECT * FROM profiles').get() as Record<string, unknown>;
    const columns = Object.keys(profile);
    db.prepare(
      'INSERT INTO profiles(' +
        columns.join(',') +
        ') VALUES(' +
        columns.map(() => '?').join(',') +
        ')',
    ).run(...Object.values(profile));
    const jobId = newId(),
      candidate = newId();
    db.prepare(
      "INSERT INTO jobs(id,profile_id,created_at,updated_at,kind,dedupe_key,payload_json,status,next_attempt_at) VALUES(?,?,0,0,'blob.gc','old-job','{\"schemaVersion\":1,\"kind\":\"blob.gc\"}','queued',0)",
    ).run(jobId, f.store.profileId);
    db.prepare(
      "INSERT INTO memory_candidates(id,profile_id,job_id,source_ids_json,candidate_json,scope_type,scope_id,decision,reason,created_at) VALUES(?,?,?,'[]','{}','profile',?,'skipped','synthetic',0)",
    ).run(candidate, f.store.profileId, jobId, f.store.profileId);
    db.pragma('user_version=15');
    await migrate(db, join(f.dir, 'migration-backups'));
    await migrate(db, join(f.dir, 'migration-backups'));
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.prepare('SELECT id FROM jobs WHERE id=?').get(jobId)).toEqual({ id: jobId });
    expect(db.prepare('SELECT job_id FROM memory_candidates WHERE id=?').get(candidate)).toEqual({
      job_id: jobId,
    });
    db.close();
  } finally {
    f.store.close();
  }
});
