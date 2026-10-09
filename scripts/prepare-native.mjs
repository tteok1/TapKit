import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { root } from './lib.mjs';
import { digest, assertDigest } from './runtime-fetch.mjs';
const lock = JSON.parse(await readFile(join(root, 'native-lock.json'), 'utf8'));
const require = createRequire(join(root, 'packages/storage/package.json'));
const packagePath = require.resolve('better-sqlite3/package.json');
const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
if (manifest.version !== lock.version || process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Native target mismatch');
assertDigest(await digest(join(dirname(packagePath), lock.file)), lock.sha256);
console.log(
  'Verified better-sqlite3 Node-API prebuild ' + lock.sha256 + '; Electron probe runs after build',
);
