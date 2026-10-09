import {
  FILE_LIMITS,
  FileLimitsSchema,
  ParsedDocumentSchema,
  type FileLimits,
} from '@tapkit/contracts';
import type { getDocument, TextItem } from 'pdfjs-dist/types/src/display/api';
import { assertFileSize, emptyDocument, ParseError } from './text';

export type PdfApi = { getDocument: typeof getDocument };
function multiply(a: number[], b: number[]) {
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}
function rectangle(
  item: TextItem,
  transform: number[],
  pageWidth: number,
  pageHeight: number,
  ascent?: number,
) {
  const m = multiply(transform, item.transform),
    horizontal = Math.hypot(m[0]!, m[1]!),
    vertical = Math.hypot(m[2]!, m[3]!);
  if (![...m, item.width, item.height, pageWidth, pageHeight].every(Number.isFinite))
    throw new ParseError('CORRUPT_FILE');
  if (!horizontal || !vertical || pageWidth <= 0 || pageHeight <= 0) return undefined;
  const dx = m[0]! / horizontal,
    dy = m[1]! / horizontal,
    ux = m[2]! / vertical,
    uy = m[3]! / vertical;
  const height = Math.abs(item.height) * Math.hypot(transform[2]!, transform[3]!);
  const width = Math.abs(item.width) * Math.hypot(transform[0]!, transform[1]!);
  const top = height * (Number.isFinite(ascent) ? ascent! : 1);
  const xs: number[] = [],
    ys: number[] = [];
  for (const x of [0, width])
    for (const y of [top, top - height]) {
      xs.push(m[4]! + dx * x + ux * y);
      ys.push(m[5]! + dy * x + uy * y);
    }
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const left = clamp(Math.min(...xs) / pageWidth),
    right = clamp(Math.max(...xs) / pageWidth);
  const upper = clamp(Math.min(...ys) / pageHeight),
    lower = clamp(Math.max(...ys) / pageHeight);
  return {
    x: left,
    y: upper,
    width: Math.min(1 - left, right - left),
    height: Math.min(1 - upper, lower - upper),
  };
}
/** Text-only PDF API: no rendering, actions, XFA, attachments, remote URLs or system-font lookup. */
export async function parsePdfFile(
  bytes: Buffer,
  api: PdfApi,
  assetRoot: string,
  rawLimits: FileLimits = FILE_LIMITS,
) {
  const limits = FileLimitsSchema.parse(rawLimits);
  assertFileSize(bytes, limits);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new ParseError('MAGIC_MISMATCH');
  const task = api.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    enableXfa: false,
    useWasm: false,
    useWorkerFetch: false,
    stopAtErrors: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    cMapUrl: assetRoot + '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: assetRoot + '/standard_fonts/',
    verbosity: 0,
  });
  try {
    const source = await task.promise,
      doc = emptyDocument('pdf');
    if (source.numPages > limits.maxPdfPages) throw new ParseError('PAGE_LIMIT');
    let emptyPages = 0;
    for (let index = 0; index < source.numPages; index++) {
      const page = await source.getPage(index + 1),
        view = page.getViewport({ scale: 1 });
      if (
        !Number.isFinite(view.width) ||
        !Number.isFinite(view.height) ||
        view.width <= 0 ||
        view.height <= 0
      )
        throw new ParseError('CORRUPT_FILE');
      doc.pages.push({ width: view.width, height: view.height });
      const content = await page.getTextContent();
      let found = false;
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        if (item.str.length > 1_000_000 || doc.blocks.length >= 200000)
          throw new ParseError('OUTPUT_LIMIT');
        found = true;
        const rect = rectangle(
          item,
          view.transform,
          view.width,
          view.height,
          content.styles[item.fontName]?.ascent,
        );
        doc.blocks.push({
          id: 'text-' + (doc.blocks.length + 1),
          kind: 'text',
          text: item.str,
          locator: { kind: 'pdf', pageIndex: index, ...(rect ? { rects: [rect] } : {}) },
        });
      }
      if (!found) emptyPages++;
      page.cleanup();
    }
    if (emptyPages) doc.quality.warnings.push('PAGES_WITHOUT_TEXT');
    doc.quality.needsOcr = emptyPages === source.numPages;
    if (doc.quality.needsOcr) doc.quality.warnings.push('OCR_UNSUPPORTED');
    return ParsedDocumentSchema.parse(doc);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    if (error && typeof error === 'object' && 'name' in error && error.name === 'PasswordException')
      throw new ParseError('ENCRYPTED_FILE');
    throw new ParseError('CORRUPT_FILE');
  } finally {
    await task.destroy();
  }
}
