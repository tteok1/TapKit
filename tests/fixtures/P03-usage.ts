// Only seeds an isolated synthetic history; no scheduler, provider request or native helper starts.
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { openStore, BlobStore, FileRepository, newId } from '../../packages/storage/src';
import { ChatService } from '../../packages/core/src/chat-service';
import { CoreService } from '../../packages/core/src/service';
import { pdfFixture } from './P03-pdf';
import {
  CreatedEntitySchema,
  ChatMaterialSchema,
  DEFAULT_MODEL_PREFERENCES,
  FILE_PARSER_VERSION,
  ParsedDocumentSchema,
} from '../../packages/contracts/src';
async function main() {
  const root = process.argv[2]!;
  await mkdir(join(root, 'profile'), { recursive: true });
  const store = await openStore(join(root, 'profile'));
  const blobs = new BlobStore(store),
    files = new FileRepository(store, blobs);
  const chat = new ChatService(store, blobs, {
    catalog: async () => [],
    effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream() {
        throw new Error('Synthetic usage fixture must not execute model');
      },
    },
  });
  const core = new CoreService(store);
  const sessionReply = core.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'sessions.create',
    payload: { mode: 'chat', title: '中文附件会话' },
  });
  if (!sessionReply.ok) throw new Error('Synthetic session failed');
  const sessionId = CreatedEntitySchema.parse(sessionReply.data).entityId;
  const source = '历史原件保留';
  await writeFile(join(root, '原件.txt'), source);
  const attachmentReply = await chat.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'inputs.attach',
    payload: { sessionId, name: '版本资料.txt', bytes: Buffer.from(source).toString('base64') },
  });
  if (!attachmentReply.ok) throw new Error('Synthetic attachment failed');
  const attachment = ChatMaterialSchema.parse(attachmentReply.data);
  if (attachment.ref.kind !== 'file') throw new Error('Synthetic file missing');
  const ref = attachment.ref;
  files.link(ref.fileId, ref.versionId, { type: 'session', id: sessionId });
  const runId = store.db.transaction(() => {
    const messageId = chat.insertMessage(
      chat.session(sessionId),
      'user',
      '阅读旧版 <img src=x onerror=alert(1)>',
      'final',
      null,
      { attachments: [ref] },
    );
    return chat.createRun(chat.session(sessionId), messageId, null);
  })();
  const cancelled = await chat.dispatch({
    protocolVersion: 1,
    requestId: newId(),
    command: 'runs.cancel',
    payload: { runId },
  });
  if (!cancelled.ok) throw new Error('Synthetic cancel failed');
  const replacement = await blobs.put(Buffer.from('版本二合成原件'), 'text/plain');
  files.importBlob({
    blobId: replacement.id,
    name: '版本资料.txt',
    relativePath: '版本资料.txt',
    owner: { type: 'library' },
    replaceId: ref.fileId,
  });
  if (process.argv[3] === 'ocr') {
    const pending = files.jobs.claim('synthetic-old-job');
    if (pending) files.jobs.cancel(pending.id);
    const bytes = pdfFixture(null),
      blob = await blobs.put(bytes, 'application/pdf');
    const file = files.importBlob({
      blobId: blob.id,
      name: '扫描资料.pdf',
      relativePath: '扫描资料.pdf',
      owner: { type: 'library' },
    }).file;
    const job = files.jobs.claim('synthetic-ocr-structure');
    if (!job || JSON.parse(job.payload_json).fileVersionId !== file.version.id)
      throw new Error('OCR fixture job mismatch');
    files.beginParse(job, file.version.id);
    // Synthetic derived structure tests the actual persistence/UI path, never native acceptance.
    await files.completeParse(
      job,
      file.version.id,
      ParsedDocumentSchema.parse({
        schemaVersion: 1,
        parserVersion: FILE_PARSER_VERSION,
        format: 'pdf',
        blocks: [],
        pages: [{ width: 200, height: 200 }],
        sheets: [],
        slides: [],
        entries: [],
        quality: { needsOcr: true, warnings: ['PAGES_WITHOUT_TEXT', 'OCR_UNSUPPORTED'] },
      }),
      new AbortController().signal,
    );
    files.jobs.finish(job, 'completed', file.version.id);
    await writeFile(join(root, '扫描原件.pdf'), bytes);
  }
  await chat.stop();
  store.close();
  process.stdout.write('P03_USAGE_FIXTURE_SEEDED\n');
}
void main().catch(() => {
  process.stderr.write('P03_USAGE_FIXTURE_FAILED\n');
  process.exitCode = 1;
});
