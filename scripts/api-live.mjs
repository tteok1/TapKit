import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { nodeExe, pnpm, root, lockedEnv } from './lib.mjs';

export const apiLiveProviders = [
  'deepseek',
  'hunyuan',
  'xai',
  'doubao',
  'openai-compatible',
  'anthropic-compatible',
];
export function runApiLive(args) {
  const prepareOnly = args.includes('--prepare-only');
  const textOnly = args.includes('--text-only');
  const options = args.filter((arg) => !['--prepare-only', '--text-only'].includes(arg));
  if (
    options.length !== 4 ||
    options[0] !== '--provider' ||
    options[2] !== '--account' ||
    !options[3] ||
    !apiLiveProviders.includes(options[1])
  ) {
    console.error(
      'P01-02 live requires --provider <API provider> --account <exact label or ID> [--prepare-only] [--text-only].',
    );
    process.exit(2);
  }
  if (!process.env.TAPKIT_LIVE_DATA_DIR || (!prepareOnly && process.env.TAPKIT_API_LIVE !== '1')) {
    console.error(
      'P01-02 live NOT RUN: set TAPKIT_API_LIVE=1 and TAPKIT_LIVE_DATA_DIR to an existing .test-data/P01-02-live-* profile.',
    );
    process.exit(2);
  }
  if (!prepareOnly && process.platform !== 'win32') {
    console.error('P01-02 live secure Key prompt requires Windows PowerShell.');
    process.exit(2);
  }
  pnpm(['exec', 'vite', 'build', '--config', 'tests/live/api.vite.config.ts']);
  const runner = join(root, '.test-data/P01-02-live-runner/index.cjs');
  // Public account preflight must succeed before the secure Key prompt appears.
  const preflight = spawnSync(
    nodeExe(),
    [runner, '--describe', root, process.env.TAPKIT_LIVE_DATA_DIR, options[1], options[3]],
    { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000 },
  );
  if (preflight.status !== 0) {
    console.error(
      'P01-02 live NOT RUN: isolated profile/account preflight failed; check the exact account label or ID.',
    );
    process.exit(2);
  }
  const selected = JSON.parse(preflight.stdout);
  console.log(
    JSON.stringify({
      ...selected,
      runMode: textOnly ? 'text-only' : 'full',
      requests: textOnly ? 1 : 6,
      maxOutputTokens: textOnly ? 128 : 768,
    }),
  );
  if (prepareOnly) return 0;
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(root, 'scripts/api-live-key.ps1'),
      '-NodePath',
      nodeExe(),
      '-RunnerPath',
      runner,
      '-RootPath',
      root,
      '-DataDir',
      process.env.TAPKIT_LIVE_DATA_DIR,
      '-Provider',
      options[1],
      '-Account',
      selected.accountId,
      '-ExpectedBinding',
      selected.bindingHash,
      '-RunMode',
      textOnly ? 'text-only' : 'full',
    ],
    { cwd: root, env: lockedEnv(), stdio: 'inherit', windowsHide: true, timeout: 360_000 },
  );
  if (result.error || result.status === null) {
    console.error('P01-02 live runner could not complete; no automatic retry.');
    return 2;
  }
  return [0, 1, 2].includes(result.status) ? result.status : 2;
}
