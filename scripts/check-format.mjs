import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { check, getFileInfo, resolveConfig } from 'prettier';
import { root } from './lib.mjs';

// A recursive glob can enumerate ignored private/ACL-protected runtime folders.
// Git supplies tracked files plus non-ignored new files without entering those folders.
const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean),
  ),
];
let checked = 0,
  failed = 0;
for (const file of files) {
  const path = resolve(root, file);
  const info = await getFileInfo(path, { ignorePath: resolve(root, '.prettierignore') });
  if (info.ignored || !info.inferredParser) continue;
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue; // Tracked deletion in the working tree.
    throw error;
  }
  const options = await resolveConfig(path);
  checked++;
  if (!(await check(source, { ...options, filepath: path }))) {
    console.error('Formatting required: ' + file);
    failed++;
  }
}
console.log(`Formatting checked ${checked} repository files; ${failed} failures.`);
if (failed) process.exitCode = 1;
