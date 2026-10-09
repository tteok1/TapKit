import { lstat, open, rename } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { FILE_LIMITS, IngestInputSchema, FileParseReasonSchema } from '@tapkit/contracts';
import { parseTextFile, ParseError } from './text';
import { parseZipFile } from './archive';
import { parseOfficeFile } from './office';
import { parsePdfFile, type PdfApi } from './pdf';
let stage: 'input_manifest' | 'original' | 'hash' | 'format' | 'output' = 'input_manifest';

async function boundedRead(path: string, limit: number) {
  const meta = await lstat(path);
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > limit)
    throw new ParseError('OUTPUT_LIMIT');
  const file = await open(path, 'r');
  try {
    const pinned = await file.stat();
    if (!pinned.isFile() || pinned.size > limit) throw new ParseError('OUTPUT_LIMIT');
    const bytes = Buffer.alloc(pinned.size);
    let offset = 0;
    while (offset < bytes.length) {
      const chunk = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!chunk.bytesRead) throw new ParseError('SOURCE_CHANGED');
      offset += chunk.bytesRead;
    }
    if ((await file.stat()).size !== pinned.size) throw new ParseError('SOURCE_CHANGED');
    return bytes;
  } finally {
    await file.close();
  }
}
async function main() {
  const [inputRoot, workspace] = process.argv.slice(2);
  if (!inputRoot || !workspace || !isAbsolute(inputRoot) || !isAbsolute(workspace))
    throw new ParseError('CORRUPT_FILE');
  const input = IngestInputSchema.parse(
    JSON.parse((await boundedRead(join(inputRoot, 'input.json'), 8192)).toString('utf8')),
  );
  stage = 'original';
  const bytes = await boundedRead(join(inputRoot, 'original'), FILE_LIMITS.maxFileBytes);
  stage = 'hash';
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  if (sourceSha256 !== input.sha256) throw new ParseError('SOURCE_CHANGED');
  stage = 'format';
  const extension = input.relativePath.split('.').at(-1)?.toLowerCase();
  async function pdf() {
    const assetRoot = join(__dirname, 'pdf');
    const api = (await import(
      /* @vite-ignore */ pathToFileURL(join(assetRoot, 'pdf.mjs')).href
    )) as PdfApi;
    return parsePdfFile(bytes, api, assetRoot);
  }
  const doc =
    extension === 'pdf'
      ? await pdf()
      : extension === 'docx' || extension === 'xlsx' || extension === 'pptx'
        ? await parseOfficeFile(bytes, extension)
        : /\.zip$/i.test(input.relativePath)
          ? await parseZipFile(bytes)
          : parseTextFile(bytes, input.relativePath);
  const json = JSON.stringify({
    schemaVersion: 1,
    fileVersionId: input.fileVersionId,
    parserVersion: input.parserVersion,
    sourceSha256,
    document: doc,
  });
  stage = 'output';
  if (Buffer.byteLength(json) > FILE_LIMITS.maxFileBytes) throw new ParseError('OUTPUT_LIMIT');
  const temp = join(workspace, 'parsed.tmp'),
    target = join(workspace, 'parsed.json');
  // A fresh private workspace is mandatory; never use an old successful result.
  try {
    await lstat(target);
    throw new ParseError('SOURCE_CHANGED');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  const file = await open(temp, 'wx');
  try {
    await file.writeFile(json);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, target);
  console.log(
    JSON.stringify({
      stage: 'parser_complete',
      fileVersionId: input.fileVersionId,
      parserVersion: input.parserVersion,
    }),
  );
}
void main().catch((error) => {
  const reason = error instanceof ParseError ? error.reason : 'CORRUPT_FILE';
  const ioCode =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    [
      'EACCES',
      'EPERM',
      'ENOENT',
      'EIO',
      'ENOSPC',
      'ERR_ACCESS_DENIED',
      'MODULE_NOT_FOUND',
    ].includes(error.code)
      ? error.code
      : undefined;
  console.log(
    JSON.stringify({
      stage: 'parser_failed',
      at: stage,
      reason: FileParseReasonSchema.parse(reason),
      ...(ioCode ? { ioCode } : {}),
    }),
  );
  process.exitCode = 1;
});
