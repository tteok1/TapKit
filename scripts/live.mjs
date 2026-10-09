import { existsSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { lockedEnv, pnpm, root, run } from './lib.mjs';
import { apiLiveProviders, runApiLive } from './api-live.mjs';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
if (args[0] === '--provider' && apiLiveProviders.includes(args[1])) {
  process.exit(runApiLive(args));
}
if (args.length !== 2 || args[0] !== '--provider' || args[1] !== 'codex-subscription') {
  console.error(
    'Live validation requires --provider codex-subscription, or an API provider with --account.',
  );
  process.exit(2);
}
if (process.env.TAPKIT_CODEX_LIVE_R01 !== '1' || !process.env.TAPKIT_LIVE_DATA_DIR) {
  console.error(
    'P01-01 live NOT RUN: R01 requires explicit opt-in and an isolated TapKit test profile.',
  );
  process.exit(2);
}
const requested = process.env.TAPKIT_LIVE_DATA_DIR;
if (!isAbsolute(requested) || !existsSync(requested)) {
  console.error('P01-01 live NOT RUN: test profile must already exist at an absolute path.');
  process.exit(2);
}
const directory = realpathSync(requested);
const testRoot = realpathSync(resolve(root, '.test-data'));
const child = relative(testRoot, directory);
if (
  !child ||
  child.startsWith('..') ||
  isAbsolute(child) ||
  !basename(directory).startsWith('P01-01-live-')
) {
  console.error(
    'P01-01 live NOT RUN: only .test-data/P01-01-live-* profiles are allowed; logout is destructive.',
  );
  process.exit(2);
}
pnpm(['exec', 'vite', 'build', '--config', 'tests/live/vite.config.ts']);
const require = createRequire(import.meta.url);
const env = lockedEnv({ TAPKIT_LIVE_DATA_DIR: directory });
delete env.ELECTRON_RUN_AS_NODE;
delete env.TAPKIT_STARTUP_DIAGNOSTICS;
// Each phase is a distinct process. Phase one must exit successfully and release
// SQLite/profile locks before phase two reloads the encrypted, expired credential.
for (const phase of ['conversation', 'restart-refresh'])
  run(
    require('electron'),
    [join(root, '.test-data/P01-01-live-runner/index.cjs'), '--phase', phase],
    {
      env,
      timeout: 600_000,
    },
  );
