import { beforeAll, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { FILE_PARSER_VERSION, ParsedDocumentSchema } from '../../packages/contracts/src';
import { officeZip, docxFixture, xlsxFixture, pptxFixture } from '../fixtures/P03-office';
import { pdfFixture } from '../fixtures/P03-pdf';
const exec = promisify(execFile),
  node = resolve('.runtime/node/node-v24.21.0-win-x64/node.exe');
let adapter: string;
beforeAll(async () => {
  await mkdir('.test-data', { recursive: true });
  const bundle = await mkdtemp(resolve('.test-data', 'P03-01 isolated bundle '));
  adapter = join(bundle, 'parse.cjs');
  await exec(
    node,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'packages/retrieval/vite.worker.config.ts',
      '--outDir',
      bundle,
    ],
    { windowsHide: true, timeout: 15000 },
  );
});
test('P03-01 portable PDF adapter uses only its copied PDF API, worker and font assets', async () => {
  const f = await input(pdfFixture('Bundled text only'), undefined, '资料/原件.PDF');
  await exec(node, f.args, { windowsHide: true, timeout: 15000 });
  const output = JSON.parse(await readFile(join(f.work, 'parsed.json'), 'utf8'));
  const doc = ParsedDocumentSchema.parse(output.document);
  expect(doc.blocks[0]?.text).toBe('Bundled text only');
  expect(doc.blocks[0]?.locator).toMatchObject({ kind: 'pdf', pageIndex: 0 });
  expect(await readFile(join(f.source, 'original'))).toEqual(f.bytes);
});
test('P03-01 bundled PDF corrupt, encrypted and over-500-page inputs fail without publishing or changing the original', async () => {
  for (const [bytes, reason] of [
    [Buffer.from('%PDF-1.7\ncorrupt'), 'CORRUPT_FILE'],
    [pdfFixture('public encrypted fixture', 1, false, 'public-test-pass'), 'ENCRYPTED_FILE'],
    [pdfFixture('page', 501), 'PAGE_LIMIT'],
  ] as const) {
    const f = await input(bytes, undefined, '资料/失败.pdf');
    await expect(exec(node, f.args, { windowsHide: true, timeout: 15000 })).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(reason),
    });
    await expect(readFile(join(f.work, 'parsed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(f.source, 'original'))).toEqual(f.bytes);
  }
});
async function input(text: string | Buffer, sha?: string, name = '资料/原件.txt') {
  await mkdir('.test-data', { recursive: true });
  const base = await mkdtemp(resolve('.test-data', 'P03-01 portable parser ')),
    source = join(base, 'input'),
    work = join(base, 'workspace');
  await mkdir(source);
  await mkdir(work);
  const bytes = Buffer.from(text),
    hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(source, 'original'), bytes);
  await writeFile(
    join(source, 'input.json'),
    JSON.stringify({
      schemaVersion: 1,
      fileVersionId: '0195abc0-0000-7000-8000-000000000001',
      relativePath: name,
      sha256: sha ?? hash,
      parserVersion: FILE_PARSER_VERSION,
    }),
  );
  return {
    source,
    work,
    bytes,
    hash,
    args: [adapter, source, work],
  };
}
// Portable adapter tests on synthetic bytes only; these do not certify AppContainer isolation.
test('P03-01 portable bundled adapter writes versioned structure and leaves its synthetic source unchanged', async () => {
  const f = await input('第一行\n第二行');
  const result = await exec(node, f.args, { windowsHide: true, timeout: 15000 });
  expect(result.stdout).toContain('parser_complete');
  const output = JSON.parse(await readFile(join(f.work, 'parsed.json'), 'utf8'));
  expect(output.sourceSha256).toBe(f.hash);
  expect(output.fileVersionId).toBe('0195abc0-0000-7000-8000-000000000001');
  expect(ParsedDocumentSchema.parse(output.document).blocks.map((b) => b.text)).toEqual([
    '第一行',
    '第二行',
  ]);
  expect(await readFile(join(f.source, 'original'))).toEqual(f.bytes);
  // Fresh output is mandatory; a second process must never reuse an earlier successful result.
  await expect(exec(node, f.args, { windowsHide: true, timeout: 15000 })).rejects.toMatchObject({
    code: 1,
  });
});
test('P03-01 portable Office bundle emits DOCX, XLSX and PPTX structure without loading runtime packages', async () => {
  for (const [extension, parts, expected] of [
    ['docx', docxFixture(), '中文标题'],
    ['xlsx', xlsxFixture(), '富文本中文'],
    ['pptx', pptxFixture(), '实际第一张'],
  ] as const) {
    const f = await input(
      await officeZip(parts),
      undefined,
      `中文目录/原件.${extension.toUpperCase()}`,
    );
    await exec(node, f.args, { windowsHide: true, timeout: 15000 });
    const output = JSON.parse(await readFile(join(f.work, 'parsed.json'), 'utf8'));
    expect(output.sourceSha256).toBe(f.hash);
    expect(
      ParsedDocumentSchema.parse(output.document)
        .blocks.map((b) => b.text)
        .join('\n'),
    ).toContain(expected);
    expect(await readFile(join(f.source, 'original'))).toEqual(f.bytes);
  }
});
test('P03-01 portable adapter rejects a changed version before parse and produces no success artifact', async () => {
  const f = await input('版本变化', '0'.repeat(64));
  await expect(exec(node, f.args, { windowsHide: true, timeout: 15000 })).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining('SOURCE_CHANGED'),
  });
  await expect(readFile(join(f.work, 'parsed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(f.source, 'original'))).toEqual(f.bytes);
});
test('P03-01 portable adapter reports an empty source as failure with an original-download path still intact', async () => {
  const f = await input('');
  await expect(exec(node, f.args, { windowsHide: true, timeout: 15000 })).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining('EMPTY_FILE'),
  });
  expect(await readFile(join(f.source, 'original'))).toEqual(f.bytes);
  await expect(readFile(join(f.work, 'parsed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});
