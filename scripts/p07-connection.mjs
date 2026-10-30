import { build } from 'vite';
import { resolve, join } from 'node:path';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { lockedEnv, root } from './lib.mjs';
if (process.argv.slice(2).join(' ') !== '--prepare-only' && process.argv.length !== 2)
  throw Error('Expected --prepare-only or no arguments');
const prepareOnly = process.argv.includes('--prepare-only');
const task = process.env.TAPKIT_P07_TASK ?? 'P07-01';
if (!['P07-01', 'P07-02', 'P07-03'].includes(task)) throw Error('PERMISSION_DENIED');
if (!prepareOnly && process.env.TAPKIT_P07_LIVE !== '1')
  throw Error('Explicit P07 connection opt-in required');
await build({
  configFile: false,
  logLevel: 'error',
  plugins: [
    {
      name: 'p07-connection-native-sqlite',
      enforce: 'pre',
      resolveId(source) {
        if (source === 'better-sqlite3')
          return {
            id: resolve('packages/storage/node_modules/better-sqlite3/lib/index.js'),
            external: true,
          };
      },
    },
  ],
  build: {
    ssr: 'tests/live/P07-01.connection.ts',
    target: 'node24',
    outDir: '.test-data/P07-connection-runner',
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs', entryFileNames: 'runner.cjs' },
    },
  },
  ssr: { noExternal: true },
});
if (prepareOnly) {
  console.log('P07 connection runner built; no credentials read or model requests made.');
  process.exit(0);
}
const evidenceDir = join(root, 'docs/evidence', task);
mkdirSync(evidenceDir, { recursive: true });
const priorChecks = ['P07-01', 'P07-02', 'P07-03'].reduce((sum, id) => {
  const parent = join(root, 'docs/evidence', id);
  return (
    sum +
    (existsSync(parent)
      ? readdirSync(parent).filter(
          (name) =>
            /^connection-\d{4}-\d{2}-\d{2}(?:-\d{2})?$/.test(name) &&
            existsSync(join(parent, name, 'launch.json')),
        ).length
      : 0)
  );
}, 0);
if (priorChecks >= 20) throw Error('CONNECTION_CHECK_LIMIT');
const suffix = priorChecks ? '-' + String(priorChecks + 1).padStart(2, '0') : '';
const reportDir = join(
  evidenceDir,
  'connection-' +
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()) +
    suffix,
);
mkdirSync(reportDir, { recursive: true });
const launchFile = join(reportDir, 'launch.json');
if (existsSync(launchFile))
  throw Error('Existing live launch must be reviewed; automatic rerun refused');
const directory = mkdtempSync(join(root, '.test-data/P07-connection-zhipu-'));
// Electron's safeStorage key is profile-local and itself DPAPI protected. Carry
// only that encrypted metadata; plaintext credentials never enter this process.
const sourceProfile = JSON.parse(
  readFileSync(join(root, '.test-data/P06-connection-debug.json'), 'utf8'),
).directory;
const sourceLocalState = JSON.parse(readFileSync(join(sourceProfile, 'Local State'), 'utf8'));
if (typeof sourceLocalState.os_crypt?.encrypted_key !== 'string')
  throw Error('Missing protected safeStorage metadata');
writeFileSync(
  join(directory, 'Local State'),
  JSON.stringify({ os_crypt: sourceLocalState.os_crypt }),
  { flag: 'wx' },
);
writeFileSync(join(directory, 'P07.connection.json'), JSON.stringify({ reportDir, task }), {
  flag: 'wx',
});
writeFileSync(
  launchFile,
  JSON.stringify(
    {
      directory,
      reportDir,
      limits: { checks: 1, wireRequests: 2, outputTokensPerRequest: 128 },
      createdAt: new Date().toISOString(),
      scope: task + ' connection test only; existing Zhipu Chat/FlashX; no retries/fallback',
      debugProfileOpenedReadOnly: true,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
const env = lockedEnv();
for (const key of [
  'ELECTRON_RUN_AS_NODE',
  'TAPKIT_TEST_BUILD',
  'TAPKIT_CHAT_FIXTURE',
  'TAPKIT_WEB_FIXTURE',
  'NODE_OPTIONS',
  'TAPKIT_STARTUP_DIAGNOSTICS',
])
  delete env[key];
env.TAPKIT_P07_LIVE = '1';
env.TAPKIT_P07_TASK = task;
const electron = createRequire(import.meta.url)('electron');
for (const phase of ['create']) {
  const result = spawnSync(
    electron,
    [join(root, '.test-data/P07-connection-runner/runner.cjs'), phase, directory],
    { cwd: root, env, windowsHide: true, timeout: 350000, encoding: 'utf8' },
  );
  const output = result.stdout.split('\n').filter((l) => l.startsWith('{"phase"'));
  console.log(output.join('\n'));
  if (result.error || result.status !== 0) {
    console.error(
      'P07 connection stopped at first failed phase. Inspect the redacted report before any further request.',
    );
    process.exit(1);
  }
}
