import { mkdtempSync as createSync, lstatSync, realpathSync } from 'node:fs';
import { mkdtemp as create, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../.test-data');
/** @type {Map<string, { dev: number, ino: number }>} */
const owned = new Map();
const samePath = (a, b) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
function inside(root, path) {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
}
/** @param {string} prefix */
function checkPrefix(prefix) {
  const path = resolve(prefix);
  if (!inside(testRoot, path)) throw Error('Test temporary directory must be inside .test-data');
  // Do not adopt a pre-existing profile or traverse a linked parent.
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    if (!samePath(parent, testRoot) && !inside(testRoot, parent)) throw Error('Unsafe test parent');
    if (lstatSync(parent).isSymbolicLink() || !samePath(realpathSync(parent), parent))
      throw Error('Linked test temporary parent');
    if (samePath(parent, testRoot)) break;
  }
  return path;
}
/** @param {string} path */
function remember(path) {
  const info = lstatSync(path);
  owned.set(path, { dev: info.dev, ino: info.ino });
  return path;
}
/** Create and own a fresh automated-test directory; existing profiles are never registered.
 * @param {string} prefix
 */
export async function mkdtemp(prefix) {
  return remember(await create(checkPrefix(prefix)));
}
/** @param {string} prefix */
export function mkdtempSync(prefix) {
  return remember(createSync(checkPrefix(prefix)));
}

export async function cleanupTestDirectories() {
  if (process.env.TAPKIT_KEEP_TEST_DATA === '1') return { removed: 0, kept: owned.size };
  let removed = 0;
  const failures = [];
  for (const [path, identity] of owned) {
    try {
      // Recheck the absolute boundary and identity immediately before recursive removal.
      checkPrefix(path);
      const current = lstatSync(path);
      if (
        current.isSymbolicLink() ||
        !current.isDirectory() ||
        current.dev !== identity.dev ||
        current.ino !== identity.ino
      )
        throw Error('Test temporary directory was replaced');
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      owned.delete(path);
      removed++;
    } catch (error) {
      if (error.code === 'ENOENT') owned.delete(path);
      else failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Owned test directory cleanup failed');
  return { removed, kept: 0 };
}
