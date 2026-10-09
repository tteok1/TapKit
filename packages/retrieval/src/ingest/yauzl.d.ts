declare module 'yauzl' {
  import { EventEmitter } from 'node:events';
  import type { Readable } from 'node:stream';
  export type Entry = {
    fileName: string;
    compressedSize: number;
    uncompressedSize: number;
    generalPurposeBitFlag: number;
    externalFileAttributes: number;
    compressionMethod: number;
    crc32: number;
  };
  export class ZipFile extends EventEmitter {
    entryCount: number;
    readEntry(): void;
    close(): void;
    openReadStream(entry: Entry, callback: (error: Error | null, stream: Readable) => void): void;
  }
  export function fromBuffer(
    bytes: Buffer,
    options: {
      lazyEntries: boolean;
      autoClose: boolean;
      validateEntrySizes: boolean;
      strictFileNames: boolean;
    },
    callback: (error: Error | null, file: ZipFile) => void,
  ): void;
}
