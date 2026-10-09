import { cp, mkdir, mkdtemp, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { root, run, nodeExe, lockedEnv } from './lib.mjs';
const parent = join(root, '.cache/repro');
await mkdir(parent, { recursive: true });
const workspace = await mkdtemp(join(parent, '中文用户 工程-'));
const excluded = new Set([
  '.git',
  'node_modules',
  '.cache',
  '.runtime',
  '.test-data',
  'out',
  'dist',
  'test-results',
  'playwright-report',
  'coverage',
]);
for (const entry of await readdir(root)) {
  if (excluded.has(entry)) continue;
  await cp(join(root, entry), join(workspace, entry), {
    recursive: true,
    filter: (source) =>
      !relative(root, source)
        .split(/[\\/]/)
        .some((segment) => excluded.has(segment)),
  });
}
// Reuse only verified downloaded archives, never installed modules or extracted runtimes.
await mkdir(join(workspace, '.cache'), { recursive: true });
for (const folder of ['downloads', 'wheels'])
  await cp(join(root, '.cache', folder), join(workspace, '.cache', folder), { recursive: true });
const profile = join(workspace, '.test-data', '中文 用户目录');
await mkdir(join(profile, 'AppData/Local'), { recursive: true });
await mkdir(join(profile, 'AppData/Roaming'), { recursive: true });
const env = lockedEnv({
  USERPROFILE: profile,
  LOCALAPPDATA: join(profile, 'AppData/Local'),
  APPDATA: join(profile, 'AppData/Roaming'),
});
const lockPath = join(workspace, 'pnpm-lock.yaml');
const before = createHash('sha256')
  .update(await readFile(lockPath))
  .digest('hex');
const results = [];
function command(label, executable, args) {
  const start = new Date().toISOString();
  run(executable, args, { cwd: workspace, env });
  results.push({ command: label, exitCode: 0, start, end: new Date().toISOString() });
}
command('pnpm bootstrap (fresh directory)', nodeExe(), [join(workspace, 'scripts/bootstrap.mjs')]);
const localNode = join(
  workspace,
  '.runtime/node',
  JSON.parse(await readFile(join(workspace, 'runtime-lock.json'), 'utf8')).runtimes.node.directory,
  'node.exe',
);
const manager = join(workspace, '.cache/tools/pnpm/package/bin/pnpm.mjs');
for (const script of ['check', 'test:unit', 'test:integration', 'build'])
  command('pnpm ' + script, localNode, [manager, script]);
command('pnpm test:e2e -- --grep P00-01', localNode, [
  manager,
  'test:e2e',
  '--',
  '--grep',
  'P00-01',
]);
command('pnpm dev (fresh directory)', localNode, [join(workspace, 'scripts/dev-smoke.mjs')]);
const targets = [join(workspace, 'node_modules'), join(workspace, 'apps/desktop/node_modules')];
for (const pkg of await readdir(join(workspace, 'packages')))
  targets.push(join(workspace, 'packages', pkg, 'node_modules'));
for (const target of targets) {
  let stat;
  try {
    stat = await lstat(target);
  } catch {
    continue;
  }
  if (!stat.isDirectory()) throw new Error('Expected module directory');
  const absolute = resolve(target);
  if (!absolute.startsWith(resolve(workspace) + '\\')) throw new Error('Unsafe delete target');
  // Native PowerShell deletion stays inside the freshly created, verified repro tree.
  const escaped = absolute.replaceAll("'", "''");
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Remove-Item -LiteralPath '" + escaped + "' -Recurse -Force",
    ],
    { cwd: workspace, env },
  );
}
command('pnpm bootstrap (after deleting all node_modules)', localNode, [
  join(workspace, 'scripts/bootstrap.mjs'),
]);
command('pnpm test:e2e -- --grep P00-01 (reinstalled)', localNode, [
  manager,
  'test:e2e',
  '--',
  '--grep',
  'P00-01',
]);
const after = createHash('sha256')
  .update(await readFile(lockPath))
  .digest('hex');
if (before !== after) throw new Error('Frozen lock changed during reproduction');
await writeFile(
  join(root, 'docs/evidence/P00-01/repro-results.json'),
  JSON.stringify(
    {
      workspace,
      simulatedProfile: profile,
      actualWindowsAccountChanged: false,
      lockSha256: after,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log('P00-01 REPRO_OK ' + workspace);
