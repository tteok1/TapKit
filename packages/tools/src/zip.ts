import yazl from 'yazl';
/** A bounded ZIP writer for already authorized, in-memory managed bytes. */
export async function managedZip(entries: { name: string; bytes: Buffer }[]) {
  if (entries.reduce((n, e) => n + e.bytes.length, 0) > 200 * 1024 * 1024)
    throw new Error('FILE_TOO_LARGE');
  const zip = new yazl.ZipFile(),
    chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (bytes: Buffer) => chunks.push(bytes));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
  for (const e of entries) zip.addBuffer(e.bytes, e.name, { compress: false });
  zip.end();
  return result;
}
