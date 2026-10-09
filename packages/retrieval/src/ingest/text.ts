import { extname } from 'node:path';
import {
  FILE_LIMITS,
  FILE_PARSER_VERSION,
  FileLimitsSchema,
  FileRelativePathSchema,
  ParsedDocumentSchema,
  type FileLimits,
  type FileParseReason,
  type ParsedDocument,
} from '@tapkit/contracts';
import { XMLValidator } from 'fast-xml-parser';

export class ParseError extends Error {
  constructor(readonly reason: FileParseReason) {
    super(reason);
  }
}
export function emptyDocument(format: ParsedDocument['format']): ParsedDocument {
  return {
    schemaVersion: 1,
    parserVersion: FILE_PARSER_VERSION,
    format,
    blocks: [],
    pages: [],
    sheets: [],
    slides: [],
    entries: [],
    quality: { needsOcr: false, warnings: [] },
  };
}
const codeExtensions = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rs',
  'go',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'sh',
  'ps1',
  'sql',
  'css',
  'scss',
  'vue',
  'svelte',
  'toml',
  'ini',
  'conf',
  'log',
]);
export function decodeText(bytes: Uint8Array) {
  try {
    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe)
      text = new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
    else if (bytes[0] === 0xfe && bytes[1] === 0xff)
      text = new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
    else text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error();
    return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  } catch {
    throw new ParseError('TEXT_ENCODING');
  }
}
export function assertFileSize(bytes: Uint8Array, limits: FileLimits) {
  if (!bytes.length) throw new ParseError('EMPTY_FILE');
  if (bytes.length > limits.maxFileBytes) throw new ParseError('ARCHIVE_LIMIT');
}
export function columnName(index: number) {
  let label = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}
export function parseDelimited(text: string, delimiter: ',' | '\t', limits: FileLimits) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    closed = false,
    total = 0;
  const cell = () => {
    if (value.length > 1000000 || row.length >= limits.maxColumns || ++total > limits.maxCells)
      throw new ParseError('TABLE_LIMIT');
    row.push(value);
    value = '';
    closed = false;
  };
  const finish = () => {
    cell();
    if (rows.length >= limits.maxRows) throw new ParseError('TABLE_LIMIT');
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === delimiter) cell();
    else if (char === '\n') finish();
    else if (char === '"' && !value && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new ParseError('CORRUPT_FILE');
      value += char;
    }
    if (value.length > 1000000) throw new ParseError('TABLE_LIMIT');
  }
  if (quoted) throw new ParseError('CORRUPT_FILE');
  if (value || row.length || closed || (text.length && !text.endsWith('\n'))) finish();
  return rows;
}

/** Worker-side text parser; Core calls the isolated worker, never this function on user input. */
export function parseTextFile(
  bytes: Uint8Array,
  relativePath: string,
  rawLimits: FileLimits = FILE_LIMITS,
) {
  const limits = FileLimitsSchema.parse(rawLimits);
  relativePath = FileRelativePathSchema.parse(relativePath);
  assertFileSize(bytes, limits);
  const extension = extname(relativePath).slice(1).toLowerCase();
  if (['doc', 'xls', 'ppt', 'docm', 'xlsm', 'pptm'].includes(extension))
    throw new ParseError(extension.endsWith('m') ? 'MACRO_FORMAT' : 'FORMAT_UNSUPPORTED');
  if (
    ![
      'txt',
      'md',
      'markdown',
      'csv',
      'tsv',
      'json',
      'yaml',
      'yml',
      'xml',
      'html',
      'htm',
      ...codeExtensions,
    ].includes(extension)
  )
    throw new ParseError('FORMAT_UNSUPPORTED');
  const signature = Buffer.from(bytes.subarray(0, 5));
  if (
    signature.subarray(0, 2).toString() === 'PK' ||
    signature.toString() === '%PDF-' ||
    (bytes[0] === 0x89 && bytes[1] === 0x50) ||
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    )
  )
    throw new ParseError('MAGIC_MISMATCH');
  let text = decodeText(bytes);
  if (!text.trim()) throw new ParseError('EMPTY_FILE');
  if (extension === 'json') {
    try {
      JSON.parse(text);
    } catch {
      throw new ParseError('CORRUPT_FILE');
    }
  }
  if (extension === 'xml') {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new ParseError('EXTERNAL_ENTITY');
    if (XMLValidator.validate(text) !== true) throw new ParseError('CORRUPT_FILE');
  }
  if (extension === 'html' || extension === 'htm') {
    // The normalized result is plain text, never executable markup or a remote resource.
    text = text
      .replace(/<(script|style|iframe|object|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\s*(?:br|\/p|\/div|\/h[1-6]|\/li)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ');
    if (!text.trim()) throw new ParseError('EMPTY_FILE');
  }
  const format =
    extension === 'csv' || extension === 'tsv'
      ? 'sheet'
      : codeExtensions.has(extension)
        ? 'code'
        : extension === 'md' || extension === 'markdown'
          ? 'markdown'
          : 'text';
  const doc = emptyDocument(format);
  if (format === 'sheet') {
    const rows = parseDelimited(text, extension === 'csv' ? ',' : '\t', limits);
    doc.sheets.push({
      id: 'sheet1',
      name: 'Sheet1',
      rows: rows.length,
      columns: rows.reduce((n, r) => Math.max(n, r.length), 0),
      cells: rows.flatMap((r, ri) =>
        r.map((value, ci) => ({ row: ri + 1, column: ci + 1, value, calculated: true })),
      ),
    });
    rows.forEach((r, i) =>
      doc.blocks.push({
        id: 'row-' + (i + 1),
        kind: 'table',
        text: r.join('\t'),
        locator: {
          kind: 'sheet',
          sheetId: 'sheet1',
          range: `A${i + 1}:${columnName(r.length)}${i + 1}`,
        },
      }),
    );
  } else {
    let offset = 0;
    for (const [index, line] of text.split('\n').entries()) {
      if (doc.blocks.length >= 100000 || line.length > 1000000) throw new ParseError('TABLE_LIMIT');
      const heading = format === 'markdown' ? /^(#{1,6})\s+/.exec(line) : null;
      doc.blocks.push({
        id: 'line-' + (index + 1),
        kind: heading ? 'heading' : format === 'code' ? 'code' : 'text',
        text: line,
        locator:
          format === 'code'
            ? { kind: 'code', path: relativePath, lineStart: index + 1, lineEnd: index + 1 }
            : { kind: 'text', start: offset, end: offset + line.length },
        ...(heading ? { level: heading[1]!.length } : {}),
      });
      offset += line.length + 1;
    }
  }
  return ParsedDocumentSchema.parse(doc);
}
