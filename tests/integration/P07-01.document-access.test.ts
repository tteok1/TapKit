import { expect, test } from 'vitest';
import { fixture } from './P06.fixture';
import {
  prepareWorkDocument,
  resolveWorkDocumentImage,
} from '../../packages/core/src/work-document';
import { ChatService } from '../../packages/core/src/chat-service';
import { newId } from '../../packages/storage/src';

const document = (ref: unknown) => ({
  schemaVersion: 1,
  title: '测试报告',
  audience: '读者',
  language: '中文',
  sections: [
    { blockId: 'one', heading: '正文', blocks: [{ type: 'paragraph', text: '材料摘要' }] },
  ],
  citations: [{ label: '材料', ref }],
});

test('P07-01 document preparation checks selected fixed source and current session access', async () => {
  const f = await fixture();
  try {
    const blob = await f.blobs.put(Buffer.from('材料'), 'text/plain');
    const input = f.files.importBlob({
      blobId: blob.id,
      name: '材料.txt',
      relativePath: '材料.txt',
      owner: { type: 'session', id: f.sessionId },
    }).file;
    const ref = { kind: 'file' as const, fileId: input.id, versionId: input.version.id };
    f.store.db
      .prepare("UPDATE file_versions SET parse_status='ready' WHERE id=?")
      .run(ref.versionId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const view = await f.create({ refs: [ref] });
    const run = f.work.repo.row(view.runId);
    const result = await prepareWorkDocument(chat, run, document(ref), () => {});
    expect(result.markdown).toContain('材料摘要');
    expect(result.spec.citations[0]?.label).toBe('材料.txt');
    expect(result.docx.subarray(0, 2).toString()).toBe('PK');
    await expect(
      prepareWorkDocument(chat, run, document({ ...ref, versionId: newId() }), () => {}),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    let guardCount = 0;
    await expect(
      prepareWorkDocument(chat, run, document(ref), () => {
        guardCount++;
        if (guardCount === 6)
          f.store.db.prepare('UPDATE files SET deleted_at=? WHERE id=?').run(Date.now(), input.id);
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(guardCount).toBeGreaterThanOrEqual(6);
    await expect(prepareWorkDocument(chat, run, document(ref), () => {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  } finally {
    await f.close();
  }
});

test('P07-01 task choices override model metadata while preserving document content', async () => {
  const f = await fixture();
  try {
    const view = await f.create({
      audience: '投资人',
      language: '英文',
      documentOptions: {
        template: 'proposal',
        theme: 'minimal',
        length: 'detailed',
        fields: { name: '李明', date: '2026-10-28', brand: 'TapKit' },
        tableOfContents: true,
        pageNumbers: false,
      },
    });
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const input = { ...document(null), citations: [] };
    const result = await prepareWorkDocument(chat, f.work.repo.row(view.runId), input, () => {});
    expect(result.spec.audience).toBe('投资人');
    expect(result.spec.language).toBe('英文');
    expect(result.spec.style).toEqual({
      template: 'proposal',
      theme: 'minimal',
      fields: { name: '李明', date: '2026-10-28', brand: 'TapKit' },
      tableOfContents: true,
      pageNumbers: false,
    });
    expect(result.spec.sections).toEqual(input.sections);
  } finally {
    await f.close();
  }
});

test('P07-01 creation removes invented cover fields while keeping explicit task fields', async () => {
  const f = await fixture();
  try {
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const input = {
      ...document(null),
      citations: [],
      style: {
        template: 'report',
        fields: { name: '李明', date: '2026-10-28', brand: '虚构品牌' },
        tableOfContents: false,
        pageNumbers: false,
      },
    };
    const unprovided = await f.create({ goal: '生成一份简短报告' });
    const result = await prepareWorkDocument(
      chat,
      f.work.repo.row(unprovided.runId),
      input,
      () => {},
    );
    expect(result.spec.style.fields).toEqual({ name: '', date: '', brand: '' });
    const explicit = await f.create({ goal: '姓名李明，日期2026-10-28，生成报告' });
    const selected = await prepareWorkDocument(
      chat,
      f.work.repo.row(explicit.runId),
      input,
      () => {},
    );
    expect(selected.spec.style.fields).toEqual({ name: '李明', date: '2026-10-28', brand: '' });
  } finally {
    await f.close();
  }
});

test('P07-01 unselected image fails explicitly before publishing a document', async () => {
  const f = await fixture();
  try {
    const view = await f.create({ format: 'docx' });
    const chat = new ChatService(f.store, f.blobs, {} as never);
    const input = {
      ...document(null),
      citations: [],
      sections: [
        {
          blockId: 'one',
          heading: '图片',
          blocks: [{ type: 'image', fileVersionId: newId(), alt: '示例' }],
        },
      ],
    };
    await expect(
      prepareWorkDocument(chat, f.work.repo.row(view.runId), input, () => {}),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(f.store.db.prepare('SELECT count(*) AS n FROM document_specs').get()).toEqual({ n: 0 });
  } finally {
    await f.close();
  }
});

test('P07-01 PNG byte resolver checks selected version and rechecks access around the read', async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    );
    const blob = await f.blobs.put(bytes, 'image/png');
    const file = f.files.importBlob({
      blobId: blob.id,
      name: '素材.png',
      relativePath: '素材.png',
      owner: { type: 'session', id: f.sessionId },
    }).file;
    f.store.db
      .prepare("UPDATE file_versions SET parse_status='unsupported' WHERE id=?")
      .run(file.version.id);
    const ref = { kind: 'file' as const, fileId: file.id, versionId: file.version.id };
    const view = await f.create({ format: 'docx', refs: [ref] });
    const run = f.work.repo.row(view.runId);
    const chat = new ChatService(f.store, f.blobs, {} as never);
    expect(await resolveWorkDocumentImage(chat, run, ref.versionId, () => {})).toEqual(bytes);
    await expect(resolveWorkDocumentImage(chat, run, newId(), () => {})).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    const guarded = {
      store: f.store,
      blobs: f.blobs,
      async material(input: any, sessionId?: string) {
        const result = await chat.material(input, sessionId);
        f.store.db.prepare('UPDATE files SET deleted_at=? WHERE id=?').run(Date.now(), file.id);
        return result;
      },
    };
    await expect(
      resolveWorkDocumentImage(guarded, run, ref.versionId, () => {}),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  } finally {
    await f.close();
  }
});
