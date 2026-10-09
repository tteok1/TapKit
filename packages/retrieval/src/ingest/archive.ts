import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { crc32 } from 'node:zlib';
import {
  FileRelativePathSchema,
  FILE_LIMITS,
  FileLimitsSchema,
  ParsedDocumentSchema,
  type FileLimits,
} from '@tapkit/contracts';
import { ParseError, emptyDocument } from './text';

/** Validate every central-directory entry before reading or inflating any entry. No extraction. */
export class BoundedArchive {
  readonly entries = new Map<string, Entry>();
  private constructor(
    private readonly zip: ZipFile,
    private readonly limits: FileLimits,
  ) {}
  static async open(bytes: Buffer, limits: FileLimits) {
    if (bytes.length > limits.maxArchiveBytes) throw new ParseError('ARCHIVE_LIMIT');
    const zip = await new Promise<ZipFile>((resolve, reject) => {
      fromBuffer(
        bytes,
        { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true },
        (error, file) => (error ? reject(new ParseError('CORRUPT_FILE')) : resolve(file)),
      );
    });
    const archive = new BoundedArchive(zip, limits);
    try {
      if (zip.entryCount > limits.maxArchiveEntries) throw new ParseError('ARCHIVE_LIMIT');
      await new Promise<void>((resolve, reject) => {
        let expanded = 0;
        const aliases = new Set<string>();
        zip.on('error', (error: Error) =>
          reject(
            new ParseError(
              /invalid relative path|absolute path|backslash/i.test(error.message)
                ? 'UNSAFE_ARCHIVE'
                : 'CORRUPT_FILE',
            ),
          ),
        );
        zip.on('end', resolve);
        zip.on('entry', (entry: Entry) => {
          try {
            const path = entry.fileName.endsWith('/')
              ? entry.fileName.slice(0, -1)
              : entry.fileName;
            if (
              !FileRelativePathSchema.safeParse(path).success ||
              path.normalize('NFC') !== path ||
              aliases.has(path.toLowerCase())
            )
              throw new ParseError('UNSAFE_ARCHIVE');
            aliases.add(path.toLowerCase());
            if (entry.generalPurposeBitFlag & 1 || entry.generalPurposeBitFlag & 0x40)
              throw new ParseError('ENCRYPTED_FILE');
            const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
            if (
              (unixType && unixType !== 0o100000 && unixType !== 0o040000) ||
              entry.externalFileAttributes & 0x400
            )
              throw new ParseError('UNSAFE_ARCHIVE');
            if (
              !Number.isSafeInteger(entry.uncompressedSize) ||
              entry.uncompressedSize < 0 ||
              !Number.isSafeInteger(entry.compressedSize) ||
              entry.compressedSize < 0
            )
              throw new ParseError('CORRUPT_FILE');
            expanded += entry.uncompressedSize;
            if (
              archive.entries.size >= limits.maxArchiveEntries ||
              expanded > limits.maxExpandedBytes ||
              entry.uncompressedSize > Math.max(1, entry.compressedSize) * limits.maxExpansionRatio
            )
              throw new ParseError('ARCHIVE_LIMIT');
            if (![0, 8].includes(entry.compressionMethod))
              throw new ParseError('FORMAT_UNSUPPORTED');
            archive.entries.set(entry.fileName, entry);
            zip.readEntry();
          } catch (error) {
            reject(error);
          }
        });
        zip.readEntry();
      });
      return archive;
    } catch (error) {
      zip.close();
      throw error;
    }
  }
  has(path: string) {
    return this.entries.has(path);
  }
  async read(path: string) {
    const entry = this.entries.get(path);
    if (!entry || entry.fileName.endsWith('/')) throw new ParseError('CORRUPT_FILE');
    if (entry.uncompressedSize > this.limits.maxExpandedBytes)
      throw new ParseError('ARCHIVE_LIMIT');
    return new Promise<Buffer>((resolve, reject) => {
      this.zip.openReadStream(entry, (error, stream) => {
        if (error) {
          reject(new ParseError('CORRUPT_FILE'));
          return;
        }
        const chunks: Buffer[] = [];
        let count = 0;
        stream.on('error', () => reject(new ParseError('CORRUPT_FILE')));
        stream.on('data', (chunk: Buffer) => {
          count += chunk.length;
          if (count > entry.uncompressedSize || count > this.limits.maxExpandedBytes) {
            stream.destroy();
            reject(new ParseError('ARCHIVE_LIMIT'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          const bytes = Buffer.concat(chunks, count);
          if (count !== entry.uncompressedSize || crc32(bytes) !== entry.crc32)
            reject(new ParseError('CORRUPT_FILE'));
          else resolve(bytes);
        });
      });
    });
  }
  close() {
    this.zip.close();
  }
}

export async function parseZipFile(bytes: Buffer, rawLimits: FileLimits = FILE_LIMITS) {
  const limits = FileLimitsSchema.parse(rawLimits),
    doc = emptyDocument('zip');
  const budget = { entries: 0, expanded: 0 };
  async function inspect(content: Buffer, depth: number) {
    if (depth > limits.maxArchiveDepth) throw new ParseError('ARCHIVE_LIMIT');
    const archive = await BoundedArchive.open(content, limits);
    try {
      for (const entry of archive.entries.values()) {
        budget.entries++;
        budget.expanded += entry.uncompressedSize;
        if (budget.entries > limits.maxArchiveEntries || budget.expanded > limits.maxExpandedBytes)
          throw new ParseError('ARCHIVE_LIMIT');
        const directory = entry.fileName.endsWith('/');
        if (depth === 0)
          doc.entries.push({
            path: directory ? entry.fileName.slice(0, -1) : entry.fileName,
            sizeBytes: entry.uncompressedSize,
            directory,
          });
        if (!directory && /\.zip$/i.test(entry.fileName))
          await inspect(await archive.read(entry.fileName), depth + 1);
      }
    } finally {
      archive.close();
    }
  }
  await inspect(bytes, 0);
  return ParsedDocumentSchema.parse(doc);
}
