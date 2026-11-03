import { build } from 'vite';
import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const source = JSON.parse(readFileSync('.test-data/P06-connection-debug.json', 'utf8'));
const db = new DatabaseSync(join(source.directory, 'db/app.sqlite'), { readOnly: true });
let network;
try {
  network = JSON.parse(
    db
      .prepare(
        "SELECT value_json FROM settings WHERE key='preferences' AND scope_type='profile' AND deleted_at IS NULL",
      )
      .get().value_json,
  ).values.network;
} finally {
  db.close();
}
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    target: 'node24',
    minify: false,
    outDir: '.test-data/P08-02-network-build',
    lib: { entry: 'tests/live/P08-02.network.ts', formats: ['cjs'], fileName: () => 'main.cjs' },
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((m) => 'node:' + m)],
    },
  },
});
const env = { ...process.env, TAPKIT_P08_NETWORK_SETTINGS: JSON.stringify(network) };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  resolve('node_modules/electron/dist/electron.exe'),
  [resolve('.test-data/P08-02-network-build/main.cjs')],
  { env, windowsHide: true, stdio: 'inherit' },
);
process.exitCode = await new Promise((done) => child.on('exit', (code) => done(code ?? 1)));
