import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, lstatSync, readFileSync, realpathSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  statfs,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from '@tapkit/contracts';

const RootPointer = z.strictObject({
  schemaVersion: z.literal(1),
  path: z.string().min(1).max(32767),
});
const pointer = (profile: string) => join(profile, 'data-root-v1.json');
const persistent = ['db', 'blobs', 'backups', 'secrets', 'logs', 'background-notice-v1'] as const;
function inside(parent: string, child: string) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}
export function readDataRoot(profile: string) {
  let bytes: string;
  try {
    bytes = readFileSync(pointer(profile), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return profile;
    throw error;
  }
  const value = RootPointer.parse(JSON.parse(bytes));
  if (!isAbsolute(value.path)) throw Error('DATABASE_RECOVERY_REQUIRED');
  const dir = resolve(value.path),
    meta = lstatSync(dir);
  if (
    !meta.isDirectory() ||
    meta.isSymbolicLink() ||
    realpathSync(dir).toLowerCase() !== dir.toLowerCase()
  )
    throw Error('DATABASE_RECOVERY_REQUIRED');
  return dir;
}
type Entry = { path: string; directory: boolean; size: number };
async function collect(source: string, name: string, entries: Entry[]) {
  const path = join(source, name);
  const meta = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!meta) return;
  if (
    meta.isSymbolicLink() ||
    (!meta.isFile() && !meta.isDirectory()) ||
    (await realpath(path)).toLowerCase() !== path.toLowerCase()
  )
    throw Error('PERMISSION_DENIED');
  entries.push({ path: name, directory: meta.isDirectory(), size: meta.isFile() ? meta.size : 0 });
  if (meta.isDirectory())
    for (const child of await readdir(path)) await collect(source, join(name, child), entries);
}
async function digest(path: string) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}
export async function validateMoveDestination(source: string, raw: string) {
  if (!isAbsolute(raw)) throw Error('VALIDATION_ERROR');
  const target = resolve(raw),
    meta = await lstat(target);
  if (
    !meta.isDirectory() ||
    meta.isSymbolicLink() ||
    (await realpath(target)).toLowerCase() !== target.toLowerCase() ||
    inside(source, target) ||
    inside(target, source)
  )
    throw Error('PERMISSION_DENIED');
  return target;
}
// The single Host has stopped the Core and completed all credential writes before calling this.
export async function moveDataRoot(profile: string, source: string, raw: string) {
  const target = await validateMoveDestination(source, raw);
  const entries: Entry[] = [];
  for (const name of persistent) await collect(source, name, entries);
  if (!entries.some((entry) => entry.path === join('db', 'app.sqlite')))
    throw Error('DATABASE_RECOVERY_REQUIRED');
  const disk = await statfs(target);
  if (entries.reduce((sum, entry) => sum + entry.size, 0) > disk.bavail * disk.bsize)
    throw Error('QUOTA_EXHAUSTED');
  const destination = join(target, 'TapKit-' + randomUUID());
  if (!inside(target, destination) || destination === target) throw Error('PERMISSION_DENIED');
  await mkdir(destination);
  let published = false;
  try {
    for (const entry of entries) {
      const from = join(source, entry.path),
        to = join(destination, entry.path);
      if (entry.directory) await mkdir(to);
      else {
        await copyFile(from, to, constants.COPYFILE_EXCL);
        if ((await digest(from)) !== (await digest(to))) throw Error('DATABASE_RECOVERY_REQUIRED');
        const fd = await open(to, 'r+');
        try {
          await fd.sync();
        } finally {
          await fd.close();
        }
      }
    }
    const temporary = pointer(profile) + '.' + randomUUID() + '.tmp';
    const fd = await open(temporary, 'wx');
    try {
      await fd.writeFile(JSON.stringify({ schemaVersion: 1, path: destination }));
      await fd.sync();
    } finally {
      await fd.close();
    }
    await rename(temporary, pointer(profile));
    published = true;
    return destination;
  } finally {
    if (!published) await rm(destination, { recursive: true, force: true });
  }
}
