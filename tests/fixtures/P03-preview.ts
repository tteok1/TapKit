// Isolated portable UI fixtures. This never enables native capabilities or executes Office.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { openStore, BlobStore, FileRepository, newId } from '../../packages/storage/src';
import { parsePdfFile } from '../../packages/retrieval/src/ingest/pdf';
import { parseTextFile } from '../../packages/retrieval/src/ingest/text';
import { pdfFixture } from './P03-pdf';
import type { ParsedDocument } from '../../packages/contracts/src';
import { previewImage, previewPdf } from './P03-preview-assets';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { parseZipFile } from '../../packages/retrieval/src/ingest/archive';
import { officeZip, xlsxFixture } from './P03-office';
import { CoreService } from '../../packages/core/src/service';
import { ChatService } from '../../packages/core/src/chat-service';
import { DEFAULT_MODEL_PREFERENCES } from '../../packages/contracts/src';
async function main() {
  const root = resolve(process.argv[2]!);
  await mkdir(join(root, 'profile'), { recursive: true });
  const require = createRequire(resolve('packages/retrieval/package.json'));
  const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'));
  const api = await import(pathToFileURL(join(pdfRoot, 'legacy/build/pdf.mjs')).href);
  const store = await openStore(join(root, 'profile')),
    blobs = new BlobStore(store),
    files = new FileRepository(store, blobs);
  const add = async (name: string, bytes: Buffer, doc: ParsedDocument, replaceId?: string) => {
    const blob = await blobs.put(bytes);
    const file = files.importBlob({
      blobId: blob.id,
      name,
      relativePath: name,
      owner: { type: 'library' },
      ...(replaceId ? { replaceId } : {}),
    }).file;
    const job = files.jobs.claim('P03-02 portable UI fixture');
    if (!job) throw new Error('Fixture job missing');
    files.beginParse(job, file.version.id);
    await files.completeParse(job, file.version.id, doc, new AbortController().signal);
    files.jobs.finish(job, 'completed', file.version.id);
    return { fileId: file.id, versionId: file.version.id };
  };
  const oldBytes = pdfFixture('Historical PDF text marker', 3, true),
    oldPdf = await add('预览材料.pdf', oldBytes, await parsePdfFile(oldBytes, api, pdfRoot));
  const bytes = pdfFixture('Preview page text marker', 3, true);
  const pdf = await add(
    '预览材料.pdf',
    bytes,
    await parsePdfFile(bytes, api, pdfRoot),
    oldPdf.fileId,
  );
  const pdfSamples = [];
  for (let i = 1; i <= 3; i++) {
    const bytes = previewPdf(i);
    pdfSamples.push(
      await add('排版样本-' + i + '.pdf', bytes, await parsePdfFile(bytes, api, pdfRoot)),
    );
  }
  const text = Buffer.from(
    '# 阅读标题\n\n固定版本的段落内容\n\n<script>window.forbidden=true</script>\n\n[禁止链接](javascript:alert(1))',
  );
  const markdown = await add('阅读.md', text, parseTextFile(text, '阅读.md'));
  const codeText = Buffer.from(
    Array.from({ length: 10000 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n'),
  );
  const oldCode = await add('长代码.ts', codeText, parseTextFile(codeText, '长代码.ts')),
    changedCode = Buffer.from(codeText.toString().replace('line1 = 1', 'line1 = 42'));
  const code = await add(
    '长代码.ts',
    changedCode,
    parseTextFile(changedCode, '长代码.ts'),
    oldCode.fileId,
  );
  const parts = xlsxFixture();
  parts['xl/worksheets/sheet2.xml'] = parts['xl/worksheets/sheet2.xml']!.replace('A1:D3', 'A1:D5')
    .replace(
      '</sheetData>',
      '<row r="4"><c r="A4" t="inlineStr"><is><t>合并标题</t></is></c></row></sheetData>',
    )
    .replace('</worksheet>', '<mergeCells><mergeCell ref="A4:C5"/></mergeCells></worksheet>');
  const sheetBytes = await officeZip(parts),
    sheet = await add('公式合并.xlsx', sheetBytes, await parseOfficeFile(sheetBytes, 'xlsx'));
  const csvBytes = Buffer.from('名称,数量\n第二行,2\n第一行,1'),
    csv = await add('排序.csv', csvBytes, parseTextFile(csvBytes, '排序.csv'));
  const zipBytes = await officeZip({
      '中文目录/说明.md': '# 只读目录',
      'result.json': '{"safe":true}',
    }),
    zip = await add('目录.zip', zipBytes, await parseZipFile(zipBytes));
  const imageBytes = previewImage(),
    imageBlob = await blobs.put(imageBytes),
    imageFile = files.importBlob({
      name: '静态图片.png',
      relativePath: '静态图片.png',
      blobId: imageBlob.id,
      owner: { type: 'library' },
    }).file;
  const core = new CoreService(store),
    created = core.dispatch({
      protocolVersion: 1,
      requestId: newId(),
      command: 'sessions.create',
      payload: { mode: 'chat', title: '预览固定版本会话' },
    });
  if (!created.ok || !('entityId' in created.data)) throw new Error('Session fixture failed');
  const sessionId = created.data.entityId;
  const chat = new ChatService(store, blobs, {
    catalog: async () => [],
    effective: () => ({ values: structuredClone(DEFAULT_MODEL_PREFERENCES), scope: 'profile' }),
    ledger: { hasPreferences: () => false },
    router: {
      async *stream() {
        throw new Error('Preview fixture must not execute a model');
      },
    },
  });
  files.link(oldPdf.fileId, oldPdf.versionId, { type: 'session', id: sessionId });
  files.link(pdf.fileId, pdf.versionId, { type: 'session', id: sessionId });
  chat.insertMessage(chat.session(sessionId), 'user', '阅读旧版本末页', 'final', null, {
    attachments: [{ kind: 'file', ...oldPdf, locator: { kind: 'pdf', pageIndex: 2 } }],
  });
  await chat.stop();
  const badBlob = await blobs.put(Buffer.from('Invalid PDF original retained for recovery'));
  const badFile = files.importBlob({
    blobId: badBlob.id,
    name: '损坏样本.pdf',
    relativePath: '损坏样本.pdf',
    owner: { type: 'library' },
  }).file;
  const svgBlob = await blobs.put(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="blue"/><script>window.forbidden=true</script><image href="https://example.invalid/never-fetch.png"/></svg>',
    ),
  );
  const svgFile = files.importBlob({
    blobId: svgBlob.id,
    name: '静态SVG.svg',
    relativePath: '静态SVG.svg',
    owner: { type: 'library' },
  }).file;
  await writeFile(
    join(root, 'fixtures.json'),
    JSON.stringify({
      pdf,
      oldPdf,
      pdfSamples,
      markdown,
      code,
      oldCode,
      sheet,
      csv,
      zip,
      image: { fileId: imageFile.id, versionId: imageFile.version.id },
      badPdf: { fileId: badFile.id, versionId: badFile.version.id },
      svg: { fileId: svgFile.id, versionId: svgFile.version.id },
      sessionId,
    }),
  );
  store.close();
  process.stdout.write('P03_PREVIEW_PORTABLE_FIXTURE_SEEDED\n');
}
void main().catch((error) => {
  process.stderr.write('P03_PREVIEW_FIXTURE_FAILED ' + String(error) + '\n');
  process.exitCode = 1;
});
