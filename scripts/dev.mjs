import { spawn } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { root, nodeExe, runtimeExe, lockedEnv } from './lib.mjs';
import { buildCore } from './desktop-build.mjs';
const cli = join(root, 'node_modules/electron-vite/bin/electron-vite.js');
for (const file of [
  runtimeExe('node'),
  join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
  cli,
  join(root, 'node_modules/electron/dist/electron.exe'),
]) {
  if (!existsSync(file))
    throw new Error('Development dependency missing: ' + file + '. Run bootstrap first.');
}
const dataDir = process.env.TAPKIT_DATA_DIR ?? join(root, '.test-data/development');
if (!isAbsolute(dataDir)) throw new Error('TAPKIT_DATA_DIR must be an absolute path.');
mkdirSync(dataDir, { recursive: true });
// Native helper preparation belongs to bootstrap/build, not each desktop edit.
// Unverified native execution remains unavailable through the existing capability gate.
await buildCore();
const env = lockedEnv({ TAPKIT_DATA_DIR: dataDir, NO_SANDBOX: '0' });
delete env.ELECTRON_RUN_AS_NODE;
console.log('TapKit development profile: ' + dataDir);
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const child = spawn(nodeExe(), [cli, '--watch', ...args], {
  cwd: join(root, 'apps/desktop'),
  stdio: 'inherit',
  windowsHide: true,
  env,
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
