import { expect, test } from 'vitest';
import { fixture } from './P06.fixture';
import { ChatService } from '../../packages/core/src/chat-service';
import { createWorkDocument, reviseWorkDocument } from '../../packages/core/src/work-document';
import { DocumentRepository } from '../../packages/storage/src';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';

const draft = {
  schemaVersion: 1,
  title: '报告',
  audience: '读者',
  language: '中文',
  sections: [
    { blockId: 'one', heading: '正文', blocks: [{ type: 'paragraph', text: '这是测试正文。' }] },
  ],
};

test('P07-01 document publication commits file, structure, parsing job and receipt together', async () => {
  const f = await fixture();
  try {
    const run = f.work.repo.row((await f.create()).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    let received: unknown;
    const result = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '成果.docx',
      draft,
      () => {},
      (ref) => {
        expect(f.store.db.inTransaction).toBe(true);
        received = ref;
      },
    );
    expect(result).toEqual(received);
    if (result.kind !== 'file') throw Error('not a file');
    const file = f.files.get(result.fileId, {
      versionId: result.versionId,
      owner: { type: 'task', id: run.task_id },
    });
    expect(file.version.parseStatus).toBe('pending');
    expect(file.version.previewStatus).toBe('pending');
    expect(
      new DocumentRepository(f.files).read(file.id, file.version.id, {
        type: 'task',
        id: run.task_id,
      }).title,
    ).toBe('报告');
    expect(
      f.store.db
        .prepare(
          "SELECT status FROM jobs WHERE kind='file.parse' AND json_extract(payload_json,'$.fileVersionId')=?",
        )
        .get(result.versionId),
    ).toEqual({ status: 'queued' });
    expect(await f.artifacts.verify(run, [result])).toBe(false);
    const bytes = (await f.files.original(file.id, { versionId: file.version.id })).bytes;
    const parsed = await parseOfficeFile(bytes, 'docx');
    const job = f.files.jobs.claim('document-fixture')!;
    f.files.beginParse(job, file.version.id);
    await f.files.completeParse(job, file.version.id, parsed, new AbortController().signal);
    f.files.jobs.finish(job, 'completed');
    expect(await f.artifacts.verify(run, [result])).toBe(true);
    f.store.db
      .prepare('UPDATE document_specs SET spec_json=? WHERE file_version_id=?')
      .run(JSON.stringify({ ...draft, title: '不存在的标题' }), file.version.id);
    expect(await f.artifacts.verify(run, [result])).toBe(false);
  } finally {
    await f.close();
  }
});

test('P07-01 document publication rolls back managed file, spec and job if receipt fails', async () => {
  const f = await fixture();
  try {
    const run = f.work.repo.row((await f.create()).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    await expect(
      createWorkDocument(
        chat,
        f.files,
        f.blobs,
        run,
        '成果.docx',
        draft,
        () => {},
        () => {
          throw Error('receipt failure');
        },
      ),
    ).rejects.toThrow('receipt failure');
    expect(
      f.store.db.prepare("SELECT count(*) AS n FROM files WHERE display_name='成果.docx'").get(),
    ).toEqual({ n: 0 });
    expect(f.store.db.prepare('SELECT count(*) AS n FROM document_specs').get()).toEqual({ n: 0 });
    expect(
      f.store.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='file.parse'").get(),
    ).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});

test('P07-01 publication detects concurrent changes before atomic commit', async () => {
  const f = await fixture();
  try {
    const run = f.work.repo.row((await f.create()).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    await expect(
      createWorkDocument(
        chat,
        f.files,
        f.blobs,
        run,
        '成果.docx',
        draft,
        () => {
          if (f.store.db.inTransaction)
            f.store.db
              .prepare('UPDATE tasks SET updated_at=updated_at+1 WHERE id=?')
              .run(run.task_id);
        },
        () => {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      f.store.db.prepare("SELECT count(*) AS n FROM files WHERE display_name='成果.docx'").get(),
    ).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});

test('P07-01 revision creates a new immutable version and preserves unrelated sections', async () => {
  const f = await fixture();
  try {
    const run = f.work.repo.row((await f.create()).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const spec = {
      ...draft,
      sections: [
        ...draft.sections,
        { blockId: 'two', heading: '数字', blocks: [{ type: 'paragraph', text: '金额 123.45' }] },
      ],
    };
    const first = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      '成果.docx',
      spec,
      () => {},
      () => {},
    );
    if (first.kind !== 'file') throw Error('not a file');
    const file = f.files.get(first.fileId, { owner: { type: 'session', id: run.session_id } });
    const oldBytes = (await f.files.original(file.id, { versionId: first.versionId })).bytes;
    const proposal = {
      fileId: file.id,
      baseVersion: first.versionId,
      revision: file.revision,
      blockId: 'one',
      replacement: {
        blockId: 'one',
        heading: '正文',
        blocks: [{ type: 'paragraph' as const, text: '修改后的正文' }],
      },
    };
    await expect(
      reviseWorkDocument(
        chat,
        f.files,
        f.blobs,
        run,
        proposal,
        () => {},
        () => {
          throw Error('receipt failure');
        },
      ),
    ).rejects.toThrow('receipt failure');
    expect(f.files.get(file.id).currentVersionId).toBe(first.versionId);
    const next = await reviseWorkDocument(
      chat,
      f.files,
      f.blobs,
      run,
      proposal,
      () => {},
      () => {},
    );
    if (next.kind !== 'file') throw Error('not a file');
    expect(next.fileId).toBe(first.fileId);
    expect(next.versionId).not.toBe(first.versionId);
    expect((await f.files.original(file.id, { versionId: first.versionId })).bytes).toEqual(
      oldBytes,
    );
    const repo = new DocumentRepository(f.files);
    const owner = { type: 'task' as const, id: run.task_id };
    const before = repo.read(file.id, first.versionId, owner);
    const after = repo.read(file.id, next.versionId, owner);
    expect(after.sections[1]).toEqual(before.sections[1]);
    expect(after.sections[0]?.blocks[0]).toEqual({ type: 'paragraph', text: '修改后的正文' });
    await expect(
      reviseWorkDocument(
        chat,
        f.files,
        f.blobs,
        run,
        proposal,
        () => {},
        () => {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  } finally {
    await f.close();
  }
});

test('P07-01 rejects revision of a document created by a different root task', async () => {
  const f = await fixture();
  try {
    const firstRun = f.work.repo.row((await f.create()).runId);
    const secondRun = f.work.repo.row((await f.create()).runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const first = await createWorkDocument(
      chat,
      f.files,
      f.blobs,
      firstRun,
      '成果.docx',
      draft,
      () => {},
      () => {},
    );
    if (first.kind !== 'file') throw Error('not a file');
    const file = f.files.get(first.fileId, { owner: { type: 'session', id: firstRun.session_id } });
    await expect(
      reviseWorkDocument(
        chat,
        f.files,
        f.blobs,
        secondRun,
        {
          fileId: file.id,
          baseVersion: first.versionId,
          revision: file.revision,
          blockId: 'one',
          replacement: {
            blockId: 'one',
            heading: '正文',
            blocks: [{ type: 'paragraph', text: '未授权修改' }],
          },
        },
        () => {},
        () => {},
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(f.files.get(file.id).currentVersionId).toBe(first.versionId);
  } finally {
    await f.close();
  }
});

test('P07-01 refuses a source revoked during the final asynchronous check', async () => {
  const f = await fixture();
  try {
    const source = await f.blobs.put(Buffer.from('原始资料'), 'text/plain');
    const input = f.files.importBlob({
      blobId: source.id,
      name: '资料.txt',
      relativePath: '资料.txt',
      owner: { type: 'session', id: f.sessionId },
    }).file;
    f.store.db
      .prepare("UPDATE file_versions SET parse_status='ready' WHERE id=?")
      .run(input.version.id);
    const ref = { kind: 'file' as const, fileId: input.id, versionId: input.version.id };
    const run = f.work.repo.row((await f.create({ refs: [ref] })).runId);
    const real = new ChatService(f.store, f.blobs, {} as never);
    let reads = 0;
    const chat = {
      store: f.store,
      blobs: f.blobs,
      material: async (...args: Parameters<ChatService['material']>) => {
        const value = await real.material(...args);
        if (++reads === 4)
          f.store.db.prepare('UPDATE files SET deleted_at=? WHERE id=?').run(Date.now(), input.id);
        return value;
      },
    };
    await expect(
      createWorkDocument(
        chat,
        f.files,
        f.blobs,
        run,
        '成果.docx',
        { ...draft, citations: [{ label: '模型名称', ref }] },
        () => {},
        () => {},
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(reads).toBe(4);
    expect(
      f.store.db.prepare("SELECT count(*) AS n FROM files WHERE display_name='成果.docx'").get(),
    ).toEqual({ n: 0 });
    expect(f.store.db.prepare('SELECT count(*) AS n FROM document_specs').get()).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});
