import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const evidence = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(evidence, '../../../..');
const batch = process.argv[2];
if (!['P03-01', 'P03-02', 'P03-03', 'P04-03'].includes(batch)) throw new Error('Explicit batch required');
const retry = process.argv[3];
if (retry && !/^e2e-[a-z0-9-]+$/.test(retry)) throw new Error('Explicit e2e retry name required');
const output = retry ? join(evidence, batch, retry) : join(evidence, batch);
mkdirSync(output, { recursive: true });
const backup = join(root, '.test-data', 'acceptance-evidence-' + batch + '-' + Date.now());
mkdirSync(backup, { recursive: true });
const node = join(root, '.runtime/node/node-v24.21.0-win-x64/node.exe');
const pnpm = join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs');
const temp = join(root, '.test-data', 'acceptance-temp-' + batch);
mkdirSync(temp, { recursive: true });
const dirs = [join(root, 'docs/evidence', batch)];
if (batch === 'P03-01') dirs.push(join(root, 'docs/evidence/P00-03'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const originals = new Map();
for (const dir of dirs) for (const item of readdirSync(dir, { withFileTypes: true })) {
  if (!item.isFile()) continue;
  const path = join(dir, item.name), key = relative(root, path).replaceAll('\\', '/');
  const copy = join(backup, key);
  mkdirSync(resolve(copy, '..'), { recursive: true });
  copyFileSync(path, copy);
  originals.set(path, { key, copy, sha256: sha(readFileSync(path)), size: readFileSync(path).length });
}
if (retry && batch === 'P03-02') {
  const manifest = join(evidence, batch, 'generated/docs/evidence/P03-02/native-preview-samples.json');
  if (!existsSync(manifest)) throw new Error('Fresh native preview samples missing');
  copyFileSync(manifest, join(root, 'docs/evidence/P03-02/native-preview-samples.json'));
}
const env = { ...process.env, TEMP: temp, TMP: temp, TAPKIT_STARTUP_DIAGNOSTICS: '0' };
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
env[pathKey ?? 'Path'] = resolve(node, '..') + ';' + (env[pathKey] ?? '');
delete env.TAPKIT_DATA_DIR;
delete env.TAPKIT_CHAT_FIXTURE;
delete env.TAPKIT_TEST_BUILD;
delete env.ELECTRON_RUN_AS_NODE;
const commands = [];
const unitFiles = readdirSync(join(root, 'tests/unit')).filter((name) => name.startsWith(batch) && name.endsWith('.test.ts'));
if (!retry && unitFiles.length) commands.push(['test:unit', batch, '--maxWorkers=1']);
if (!retry) commands.push(['test:integration', batch]);
commands.push(['test:e2e', '--', '--grep', batch, '--timeout=180000']);
const results = [];
let exitCode = 0;
try {
  for (const args of commands) {
    const label = args[0].replace(':', '-'), started = new Date().toISOString();
    console.log(`${batch} starting ${args.join(' ')}`);
    const logPath = join(output, label + '.log'), fd = openSync(logPath, 'w');
    let run;
    try { run = spawnSync(node, [pnpm, ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] }); }
    finally { closeSync(fd); }
    let log = readFileSync(logPath, 'utf8');
    if (run.error) { log += String(run.error); writeFileSync(logPath, log); }
    const result = { command: [node, pnpm, ...args], exitCode: run.status ?? 1, started, finished: new Date().toISOString(), log: label + '.log' };
    results.push(result);
    console.log(`${batch} ${label} exit ${result.exitCode}`);
    console.log(log.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter((line) => /Tests |Test Files| passed| failed| skipped|Error:|FAIL /.test(line)).slice(-12).join('\n'));
    if (result.exitCode) { exitCode = result.exitCode; break; }
  }
} finally {
  const changes = [];
  for (const dir of dirs) for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (!item.isFile()) continue;
    const path = join(dir, item.name), before = originals.get(path), bytes = readFileSync(path);
    if (before?.sha256 === sha(bytes)) continue;
    const key = relative(root, path).replaceAll('\\', '/'), destination = join(output, 'generated', key);
    mkdirSync(resolve(destination, '..'), { recursive: true });
    copyFileSync(path, destination);
    if (before && path.endsWith('.jsonl') && bytes.subarray(0, before.size).equals(readFileSync(before.copy))) writeFileSync(destination + '.new.jsonl', bytes.subarray(before.size));
    changes.push({ path: key, sha256: sha(bytes), previousSha256: before?.sha256 ?? null });
    if (before) copyFileSync(before.copy, path);
    else unlinkSync(path);
  }
  for (const [path, before] of originals) {
    if (!existsSync(path)) copyFileSync(before.copy, path);
    if (sha(readFileSync(path)) !== before.sha256) throw new Error('Historical evidence restore mismatch: ' + before.key);
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ batch, exitCode, commands: results, unitFileCount: unitFiles.length, historicalEvidenceRestored: true, backup, generatedEvidence: changes }, null, 2) + '\n');
  console.log(`${batch} evidence restored; ${changes.length} new/changed captures archived`);
}
process.exitCode = exitCode;
