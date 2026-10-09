import { readFile, writeFile, cp, realpath, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname, delimiter } from 'node:path';
import { root, runtimeLock } from './lib.mjs';
import { isOutsideWorkspace } from './standard-user-kit.mjs';

if (!process.argv[2]) throw new Error('Specify the existing generated test-kit directory');
const target = resolve(process.argv[2]);
if (
  !isOutsideWorkspace(root, target) ||
  (await realpath(target)).toLowerCase() !== target.toLowerCase()
)
  throw new Error('Expected a real test-kit directory outside the source workspace');
const origin = JSON.parse(
  await readFile(join(target, 'docs/evidence/P00-03/kit-origin.json'), 'utf8'),
);
if (origin.source !== 'TapKit working tree P00-03') throw new Error('Not a generated P00-03 kit');
for (const name of ['runtime-lock.json', 'native-lock.json', 'pnpm-lock.yaml']) {
  if (!(await readFile(join(root, name))).equals(await readFile(join(target, name))))
    throw new Error('Kit lock differs: ' + name);
}
const files = ['migrations/0001_core.sql', 'tests/integration/P00-03.sandbox.test.ts'];
const repaired = [];
for (const name of files) {
  const data = await readFile(join(root, name));
  await mkdir(dirname(join(target, name)), { recursive: true });
  await cp(join(root, name), join(target, name));
  repaired.push({ path: name, sha256: createHash('sha256').update(data).digest('hex') });
}
const node = join(
  target,
  '.runtime/node',
  runtimeLock.runtimes.node.directory,
  runtimeLock.runtimes.node.executable,
);
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.Path = dirname(node) + delimiter + (process.env.Path ?? process.env.PATH ?? '');
const startedAt = new Date().toISOString();
const args = [
  join(target, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
  'test:integration',
  'P00-03.capability',
  'P00-03.sandbox',
  '--reporter=json',
  '--outputFile=test-results/P00-03-repair.json',
];
console.log(
  'Checking Core migrations and sandbox assertions using the existing kit; no runtime download.',
);
const result = spawnSync(node, args, {
  cwd: target,
  env,
  encoding: 'utf8',
  windowsHide: true,
  timeout: 180000,
  maxBuffer: 8 * 1024 * 1024,
});
const destination = join(target, 'docs/evidence/P00-03');
await writeFile(
  join(destination, 'repair.log'),
  String(result.stdout ?? '') + String(result.stderr ?? ''),
);
const groups = spawnSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
  encoding: 'utf8',
  windowsHide: true,
});
const standardUser =
  groups.status === 0 &&
  !groups.stdout.includes('S-1-5-32-544') &&
  groups.stdout.includes('S-1-16-8192');
let tests = null,
  failures = [];
try {
  const report = JSON.parse(
    await readFile(join(target, 'test-results/P00-03-repair.json'), 'utf8'),
  );
  tests = {
    total: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
  };
  failures = report.testResults
    .filter((s) => s.status === 'failed')
    .map((s) => ({
      suite: s.name,
      error: s.message,
      cases: s.assertionResults
        .filter((t) => t.status === 'failed')
        .map((t) => ({ name: t.fullName, errors: t.failureMessages })),
    }));
} catch {}
const report = {
  startedAt,
  endedAt: new Date().toISOString(),
  standardUser,
  exitCode: result.status,
  repaired,
  tests,
  failures,
  note: 'Focused preparation regression only; Office/Git and the full P00 gate remain failed. Capabilities are not enabled.',
};
await writeFile(join(destination, 'repair.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log('Evidence directory: ' + destination);
process.exitCode = result.status ?? 1;
