import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const evidence = dirname(fileURLToPath(import.meta.url));
const root = resolve(evidence, '../../../..');
const name = process.argv[2];
if (!/^run-[0-9]{2}$/.test(name ?? '')) throw Error('Unique run-NN required');
const output = join(evidence, name); mkdirSync(output);
const node = join(root, '.runtime/node/node-v24.21.0-win-x64/node.exe');
const pnpm = join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs');
const env = { ...process.env };
const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path');
env[pathKey ?? 'Path'] = dirname(node) + ';' + (env[pathKey] ?? '');
for (const key of ['TAPKIT_DATA_DIR', 'TAPKIT_CHAT_FIXTURE', 'TAPKIT_WEB_FIXTURE', 'TAPKIT_TEST_BUILD', 'ELECTRON_RUN_AS_NODE']) delete env[key];
const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.split('\0').filter((p) => /^(packages|apps|resources|migrations|scripts)\//.test(p) && !/\/(out|dist|node_modules)\//.test(p) || /^(package.json|dependency-baseline.json|pnpm-lock.yaml)$/.test(p));
const hashes = () => Object.fromEntries(files.map((p) => [p, createHash('sha256').update(readFileSync(join(root, p))).digest('hex')]));
const before = hashes(), commands = [], head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim();
writeFileSync(join(output, 'sources.json'), JSON.stringify({ head, dirty: true, files: before }, null, 2));
let exitCode = 0;
for (const args of [['check'], ['test:unit', 'P05-01', 'P01-01.transport', 'P01-02.transport'], ['test:integration', 'P05-01'], ['test:e2e', '--', '--grep', 'P05-01']]) {
  const label = args[0].replace(':', '-'), started = new Date().toISOString();
  console.log('Starting ' + args.join(' '));
  const log = join(output, label + '.log'), fd = openSync(log, 'w');
  let result;
  try { result = spawnSync(node, [pnpm, ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] }); }
  finally { closeSync(fd); }
  const code = result.status ?? 1;
  commands.push({ args, started, finished: new Date().toISOString(), exitCode: code, log: label + '.log' });
  console.log(label + ' exit ' + code);
  if (code) { exitCode = code; break; }
}
const unchanged = JSON.stringify(hashes()) === JSON.stringify(before);
if (!unchanged) exitCode = 1;
writeFileSync(join(output, 'results.json'), JSON.stringify({ head, exitCode, sourcesUnchanged: unchanged, commands, realModels: 'deferred R01-R05', realSearch: 'pending R06' }, null, 2));
process.exitCode = exitCode;
