import { build } from 'vite';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const round = process.argv[2];
if (!round || !/^[a-f0-9-]{36}$/.test(round) || process.argv.length !== 3)
  throw Error('PERMISSION_DENIED');
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    ssr: 'tests/live/P07-02.validation-audit.ts',
    target: 'node24',
    outDir: '.test-data/P07-validation-audit',
    rollupOptions: {
      external: ['electron'],
      output: { format: 'cjs', entryFileNames: 'audit.cjs' },
    },
  },
  ssr: { noExternal: true },
});
const env = { ...process.env };
for (const k of [
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
  'TAPKIT_CHAT_FIXTURE',
  'TAPKIT_TEST_BUILD',
  'TAPKIT_WEB_FIXTURE',
])
  delete env[k];
const result = spawnSync(
  createRequire(import.meta.url)('electron'),
  [resolve('.test-data/P07-validation-audit/audit.cjs'), round],
  { env, windowsHide: true, encoding: 'utf8', timeout: 30000 },
);
console.log(
  result.stdout
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .join('\n'),
);
process.exitCode = result.status ?? 1;
