import { beforeAll, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FILE_LIMITS } from '../../packages/contracts/src';
import { parsePdfFile, type PdfApi } from '../../packages/retrieval/src/ingest/pdf';

function imagePdf(includeImage: boolean) {
  const image = includeImage
    ? 'q 60 0 0 60 20 40 cm BI /W 1 /H 1 /BPC 8 /CS /RGB /F /AHx ID FF0000> EI Q'
    : '';
  const stream = `BT /F1 12 Tf 20 100 Td (Example) Tj ET ${image}`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
const require = createRequire(resolve('packages/retrieval/package.json'));
let api: PdfApi, assets: string;
beforeAll(async () => {
  const path = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  api = (await import(pathToFileURL(path).href)) as PdfApi;
  assets = resolve(dirname(path), '../../');
}, 30000);

test('P07-01 isolated PDF image inspection distinguishes a painted image from text alone', async () => {
  const withImage = await parsePdfFile(imagePdf(true), api, assets, FILE_LIMITS, true);
  const noImage = await parsePdfFile(imagePdf(false), api, assets, FILE_LIMITS, true);
  expect(withImage.paintedImages).toBe(1);
  expect(noImage.paintedImages).toBe(0);
  expect((await parsePdfFile(imagePdf(true), api, assets)).paintedImages).toBeUndefined();
  await expect(
    parsePdfFile(imagePdf(true), { getDocument: api.getDocument }, assets, FILE_LIMITS, true),
  ).rejects.toThrow('CORRUPT_FILE');
});
