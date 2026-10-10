declare module 'yazl' {
  import type { Readable } from 'node:stream';
  const yazl: {
    ZipFile: new () => {
      addBuffer(bytes: Buffer, name: string, options: { compress: boolean }): void;
      end(): void;
      outputStream: Readable;
    };
  };
  export default yazl;
}
