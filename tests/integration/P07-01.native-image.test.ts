import { mkdtemp } from '../../scripts/test-temp.mjs';
import { test, expect } from 'vitest';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname } from 'node:path';
import { FILE_LIMITS } from '../../packages/contracts/src';
import { newId } from '../../packages/storage/src';
import { OfficeWorker, readExecutionCapabilities } from '../../packages/tools/src';
import { renderDocumentDraft } from '../../packages/workflows/src';
import { pdfText } from './office-security-control';
import { solidPng } from '../fixtures/P07-01.images';
import { parseOfficeFile } from '../../packages/retrieval/src/ingest/office';
import { parsePdfFile, type PdfApi } from '../../packages/retrieval/src/ingest/pdf';

test('P07-01 native isolated Office renderer displays a synthetic PNG document', async () => {
  const root = resolve('.'),
    caps = await readExecutionCapabilities(root);
  expect(caps.nativeExecution.status).toBe('available');
  expect(caps.officeRender.status).toBe('available');
  await mkdir('.test-data', { recursive: true });
  await mkdir('docs/evidence/P07-01/native-image', { recursive: true });
  const base = await mkdtemp(resolve('.test-data', 'P07-01 native image ')),
    inputRoot = join(base, 'input'),
    workspace = join(base, 'workspace');
  await mkdir(inputRoot);
  await mkdir(workspace);
  const imageId = newId(),
    png = solidPng();
  const doc = await renderDocumentDraft(
    {
      schemaVersion: 1,
      title: '图片渲染验收',
      audience: '测试',
      language: '中文',
      sections: [
        {
          blockId: 'image',
          heading: '图片素材',
          blocks: [{ type: 'image', fileVersionId: imageId, alt: '合成绿色方块' }],
        },
      ],
    },
    undefined,
    async (id) => {
      expect(id).toBe(imageId);
      return png;
    },
  );
  await writeFile(join(inputRoot, 'report.docx'), doc.docx);
  const versionId = newId();
  const output = await new OfficeWorker(root).render(
    { fileVersionId: versionId, format: 'pdf' },
    {
      fileVersionId: versionId,
      inputRoot,
      workspace,
      filename: 'report.docx',
      sha256: createHash('sha256').update(doc.docx).digest('hex'),
      requestId: newId(),
      runId: newId(),
      leaseEpoch: 1,
    },
  );
  const pdf = await readFile(output.path),
    text = (await pdfText(root, pdf)).replace(/\s+/gu, '');
  const parsedDocx = await parseOfficeFile(doc.docx, 'docx', FILE_LIMITS, true);
  expect(parsedDocx.embeddedPngHashes).toEqual([createHash('sha256').update(png).digest('hex')]);
  const require = createRequire(resolve('packages/retrieval/package.json'));
  const path = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const api = (await import(pathToFileURL(path).href)) as PdfApi;
  const parsedPdf = await parsePdfFile(
    pdf,
    api,
    resolve(dirname(path), '../../'),
    FILE_LIMITS,
    true,
  );
  expect(parsedPdf.paintedImages).toBeGreaterThanOrEqual(1);
  expect(text).toContain('图片渲染验收');
  expect(text).toContain('合成绿色方块');
  expect((await readFile(join(inputRoot, 'report.docx'))).equals(doc.docx)).toBe(true);
  await copyFile(output.path, resolve('docs/evidence/P07-01/native-image/render.pdf'));
}, 180000);
