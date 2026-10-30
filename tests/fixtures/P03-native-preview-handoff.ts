import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { assertOwnedTestDirectory } from '../../scripts/test-temp.mjs';

export const nativePreviewHandoffPath = resolve('test-results/P03-02-native-preview/handoff.json');
export const nativePreviewMarker = 'P03-02.native-preview.fixture';
export const nativePreviewMarkerText = 'P03-02 synthetic Office preview profile';
const maxFiles = 256;
const maxProfileBytes = 32 * 1024 * 1024;
const maxArchiveBytes = 16 * 1024 * 1024;
const maxJsonBytes = 48 * 1024 * 1024;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const validKey = (key: string) =>
  key === 'db/app.sqlite' || /^blobs\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(key);
type Entry = { path: string; sha256: string; data: string };
export type NativePreviewMetadata = {
  source: 'real NativeSandboxExecutor/OfficeWorker';
  peakConcurrentOfficeRenders: number;
  samples: { name: string; fileId: string; versionId: string; previewSha256: string }[];
};
export type NativePreviewHandoff = NativePreviewMetadata & {
  schemaVersion: 2;
  profileArchiveSha256: string;
  profileArchiveBase64: string;
};

async function regularFile(path: string) {
  const info = await lstat(path);
  const actual = await realpath(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    actual.toLowerCase() !== resolve(path).toLowerCase()
  )
    throw Error('Linked native preview fixture');
  return info;
}

export async function encodeNativePreviewProfile(profile: string) {
  assertOwnedTestDirectory(dirname(profile));
  if ((await realpath(profile)).toLowerCase() !== resolve(profile).toLowerCase())
    throw Error('Linked native preview fixture');
  if ((await readFile(join(profile, nativePreviewMarker), 'utf8')) !== nativePreviewMarkerText)
    throw Error('Not a synthetic native preview fixture');
  for (const forbidden of ['secrets', 'db/app.sqlite-wal', 'db/app.sqlite-shm']) {
    try {
      await lstat(join(profile, forbidden));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    throw Error('Native preview fixture must be closed and credential-free');
  }
  const files: Entry[] = [];
  let total = 0;
  async function add(key: string) {
    if (!validKey(key) || files.length >= maxFiles) throw Error('Invalid native preview entry');
    const path = join(profile, key);
    total += (await regularFile(path)).size;
    if (total > maxProfileBytes) throw Error('Native preview profile limit exceeded');
    const bytes = await readFile(path);
    files.push({ path: key, sha256: sha(bytes), data: bytes.toString('base64') });
  }
  await add('db/app.sqlite');
  for (const prefix of await readdir(join(profile, 'blobs/sha256'), { withFileTypes: true })) {
    const path = join(profile, 'blobs/sha256', prefix.name);
    if (!prefix.isDirectory() || prefix.isSymbolicLink() || !/^[a-f0-9]{2}$/.test(prefix.name))
      throw Error('Invalid native preview blob directory');
    for (const file of await readdir(path)) await add('blobs/sha256/' + prefix.name + '/' + file);
  }
  const archive = gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 1, files })));
  if (archive.length > maxArchiveBytes) throw Error('Native preview archive limit exceeded');
  return archive;
}

export async function restoreNativePreviewProfile(
  archive: Buffer,
  expectedSha: string,
  target: string,
) {
  assertOwnedTestDirectory(dirname(target));
  if (archive.length > maxArchiveBytes || sha(archive) !== expectedSha)
    throw Error('Native preview archive integrity mismatch');
  const frame = JSON.parse(gunzipSync(archive, { maxOutputLength: maxJsonBytes }).toString('utf8'));
  if (frame.schemaVersion !== 1 || !Array.isArray(frame.files) || frame.files.length > maxFiles)
    throw Error('Invalid native preview archive');
  const files: { path: string; bytes: Buffer }[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const entry of frame.files as Entry[]) {
    if (typeof entry.path !== 'string' || !validKey(entry.path) || seen.has(entry.path))
      throw Error('Invalid native preview entry');
    if (typeof entry.data !== 'string') throw Error('Invalid native preview entry');
    const bytes = Buffer.from(entry.data, 'base64');
    total += bytes.length;
    if (
      total > maxProfileBytes ||
      bytes.toString('base64') !== entry.data ||
      sha(bytes) !== entry.sha256
    )
      throw Error('Native preview entry integrity mismatch');
    seen.add(entry.path);
    files.push({ path: entry.path, bytes });
  }
  if (!seen.has('db/app.sqlite')) throw Error('Native preview database missing');
  // Validate every entry before creating anything. Never overwrite an existing profile.
  await mkdir(target);
  for (const file of files) {
    const path = join(target, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.bytes, { flag: 'wx' });
  }
  await writeFile(join(target, nativePreviewMarker), nativePreviewMarkerText, { flag: 'wx' });
}

async function artifactParent(path: string) {
  if (path !== nativePreviewHandoffPath) {
    assertOwnedTestDirectory(dirname(path));
    return;
  }
  for (const directory of [resolve('test-results'), dirname(path)]) {
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (await realpath(directory)).toLowerCase() !== directory.toLowerCase()
    )
      throw Error('Linked native preview handoff directory');
  }
}

export async function invalidateNativePreviewHandoff() {
  await artifactParent(nativePreviewHandoffPath);
  await rm(nativePreviewHandoffPath, { force: true });
}

export async function publishNativePreviewHandoff(
  profile: string,
  metadata: NativePreviewMetadata,
  path = nativePreviewHandoffPath,
) {
  const archive = await encodeNativePreviewProfile(profile);
  const frame: NativePreviewHandoff = {
    schemaVersion: 2,
    ...metadata,
    profileArchiveSha256: sha(archive),
    profileArchiveBase64: archive.toString('base64'),
  };
  await artifactParent(path);
  const temporary = path + '.' + randomUUID() + '.partial';
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(JSON.stringify(frame));
    await handle.close();
    await rename(temporary, path);
  } finally {
    await handle.close();
    await rm(temporary, { force: true });
  }
  return { profileArchiveSha256: frame.profileArchiveSha256 };
}

export async function readNativePreviewHandoff(path = nativePreviewHandoffPath) {
  await artifactParent(path);
  if ((await regularFile(path)).size > maxJsonBytes)
    throw Error('Native preview handoff limit exceeded');
  const frame = JSON.parse(await readFile(path, 'utf8')) as NativePreviewHandoff;
  if (frame.schemaVersion !== 2 || typeof frame.profileArchiveBase64 !== 'string')
    throw Error(
      'Native preview handoff is missing or stale; run the native preview integration first',
    );
  return frame;
}
