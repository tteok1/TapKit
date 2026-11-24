import { createHash } from 'node:crypto';
import { lstat, open, readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const inventoryFile = 'resources/tapkit/install-inventory.json';

export async function inspectPayload(root, signal) {
  const files = [];
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  async function visit(fullPath) {
    signal?.throwIfAborted();
    const path = relative(root, fullPath).replaceAll('\\', '/');
    const metadata = await lstat(fullPath);
    if (metadata.isDirectory()) {
      for (const name of (await readdir(fullPath)).sort()) await visit(join(fullPath, name));
      return;
    }
    if (!metadata.isFile()) throw Error('INSTALLATION_FILE_TYPE: ' + path);
    if (path === inventoryFile || path === 'Uninstall.exe') return;
    const digest = createHash('sha256');
    const handle = await open(fullPath, 'r');
    try {
      for (;;) {
        signal?.throwIfAborted();
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        digest.update(buffer.subarray(0, bytesRead));
      }
    } finally {
      await handle.close();
    }
    files.push({ path, bytes: metadata.size, sha256: digest.digest('hex') });
  }
  await visit(root);
  return files;
}

export async function verifyPayload(root, signal) {
  const manifestPath = join(root, inventoryFile);
  if (!(await lstat(manifestPath)).isFile()) throw Error('INSTALLATION_INVENTORY');
  const { schemaVersion, files } = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (schemaVersion !== 1 || !Array.isArray(files)) throw Error('INSTALLATION_INVENTORY');
  const expected = new Map(files.map((file) => [file.path, file]));
  const actual = await inspectPayload(root, signal);
  for (const file of actual) {
    const entry = expected.get(file.path);
    if (entry?.sha256 !== file.sha256 || entry?.bytes !== file.bytes)
      throw Error('INSTALLATION_FILE_MISMATCH: ' + file.path);
    expected.delete(file.path);
  }
  if (expected.size || !actual.length || actual.length !== files.length)
    throw Error('INSTALLATION_FILE_MISSING: ' + (expected.keys().next().value ?? 'inventory'));
}
