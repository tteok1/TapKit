import { beforeAll, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FILE_LIMITS } from '../../packages/contracts/src';
import { parsePdfFile, type PdfApi } from '../../packages/retrieval/src/ingest/pdf';
import { pdfFixture } from '../fixtures/P03-pdf';
const require = createRequire(resolve('packages/retrieval/package.json'));
let pdf: { api: PdfApi; assets: string };
beforeAll(async () => {
  const path = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const api = (await import(pathToFileURL(path).href)) as PdfApi;
  pdf = { api, assets: resolve(dirname(path), '../../') };
}, 30_000);
async function parser() {
  return pdf;
}
test('P03-01 actual PDF.js extracts text with normalized page rectangles while preserving source bytes', async () => {
  const { api, assets } = await parser(),
    bytes = pdfFixture(),
    original = Buffer.from(bytes);
  const doc = await parsePdfFile(bytes, api, assets);
  expect(doc.pages).toEqual([{ width: 200, height: 200 }]);
  expect(doc.blocks[0]?.text).toBe('Text location marker');
  expect(doc.blocks[0]?.locator).toMatchObject({ kind: 'pdf', pageIndex: 0, rects: [{ x: 0.1 }] });
  if (doc.blocks[0]?.locator.kind === 'pdf') {
    const rect = doc.blocks[0].locator.rects![0]!;
    expect(rect.y).toBeGreaterThan(0.4);
    expect(rect.y).toBeLessThan(0.5);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  }
  expect(bytes).toEqual(original);
});
test('P03-01 PDF page limit and corrupt/disguised bytes reject publication, while image-only pages report unavailable OCR', async () => {
  const { api, assets } = await parser();
  await expect(
    parsePdfFile(pdfFixture('page', 2), api, assets, { ...FILE_LIMITS, maxPdfPages: 1 }),
  ).rejects.toThrow('PAGE_LIMIT');
  await expect(parsePdfFile(Buffer.from('not PDF'), api, assets)).rejects.toThrow('MAGIC_MISMATCH');
  await expect(parsePdfFile(Buffer.from('%PDF-1.7\ncorrupt'), api, assets)).rejects.toThrow(
    'CORRUPT_FILE',
  );
  const doc = await parsePdfFile(pdfFixture(null), api, assets);
  expect(doc.blocks).toEqual([]);
  expect(doc.quality).toEqual({
    needsOcr: true,
    warnings: ['PAGES_WITHOUT_TEXT', 'OCR_UNSUPPORTED'],
  });
});
test('P03-01 embedded PDF JavaScript action is inert during text extraction', async () => {
  const { api, assets } = await parser();
  expect((await parsePdfFile(pdfFixture('safe text', 1, true), api, assets)).blocks[0]?.text).toBe(
    'safe text',
  );
});
test('P03-01 a genuinely encrypted synthetic PDF requires its public test password and importer reports ENCRYPTED_FILE', async () => {
  const { api, assets } = await parser(),
    bytes = pdfFixture('encrypted fixture text', 1, false, 'public-test-pass');
  await expect(parsePdfFile(bytes, api, assets)).rejects.toThrow('ENCRYPTED_FILE');
  const task = api.getDocument({
    data: new Uint8Array(bytes),
    password: 'public-test-pass',
    useSystemFonts: false,
  });
  try {
    const source = await task.promise,
      page = await source.getPage(1),
      content = await page.getTextContent();
    expect(
      content.items
        .filter((i) => 'str' in i)
        .map((i) => ('str' in i ? i.str : ''))
        .join(''),
    ).toBe('encrypted fixture text');
  } finally {
    await task.destroy();
  }
});
