import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, nodeExe, lockedEnv } from './lib.mjs';

// Independent P03 evidence. This probe never writes production capabilities.
const requiredCases = [
  'P03-01 native parser publishes text and Office structure from a read-only AppContainer input',
  'P03-01 native parser rejects corrupt and hostile Office packages while originals remain downloadable',
  'P03-01 native parser cancellation and helper kill preserve the version and allow one fenced retry',
];
const startedAt = new Date().toISOString(),
  destination = join(root, 'docs/evidence/P03-01');
await mkdir(destination, { recursive: true });
await mkdir(join(root, 'test-results'), { recursive: true });
const result = spawnSync(
  nodeExe(),
  [
    join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
    'test:integration',
    'P03-01.native-parser',
    '--reporter=json',
    '--outputFile=test-results/P03-01-native-parser.json',
  ],
  {
    cwd: root,
    env: lockedEnv(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  },
);
await writeFile(
  join(destination, 'parser-probe.log'),
  String(result.stdout ?? '') + String(result.stderr ?? ''),
);
let tests = null;
try {
  tests = JSON.parse(await readFile(join(root, 'test-results/P03-01-native-parser.json'), 'utf8'));
} catch {
  /* absent report is a failure */
}
const assertions = (tests?.testResults ?? []).flatMap((f) => f.assertionResults ?? []);
const missingCases = requiredCases.filter(
  (title) => !assertions.some((a) => a.title === title && a.status === 'passed'),
);
const groups = spawnSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
  encoding: 'utf8',
  windowsHide: true,
});
const standardUser =
  groups.status === 0 &&
  !groups.stdout.includes('S-1-5-32-544') &&
  groups.stdout.includes('S-1-16-8192');
let adapterSha256 = null;
try {
  adapterSha256 = createHash('sha256')
    .update(await readFile(join(root, 'packages/retrieval/dist/parse.cjs')))
    .digest('hex');
} catch {
  /* missing trusted adapter fails acceptance */
}
const passed =
  result.status === 0 &&
  standardUser &&
  adapterSha256 &&
  missingCases.length === 0 &&
  tests?.numTotalTests === requiredCases.length &&
  tests.numFailedTests === 0 &&
  tests.numPendingTests === 0;
const report = {
  schemaVersion: 1,
  task: 'P03-01',
  startedAt,
  endedAt: new Date().toISOString(),
  command:
    'pnpm test:integration P03-01.native-parser --reporter=json --outputFile=test-results/P03-01-native-parser.json',
  exitCode: result.status,
  standardUser,
  adapterSha256,
  passed: !!passed,
  missingCases,
  tests: tests
    ? {
        total: tests.numTotalTests,
        passed: tests.numPassedTests,
        failed: tests.numFailedTests,
        pending: tests.numPendingTests,
      }
    : null,
};
await writeFile(join(destination, 'parser-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
for (const a of assertions.filter((a) => a.status === 'failed'))
  console.error(
    'P03_PARSER_FAILURE',
    JSON.stringify({
      title: a.title,
      reason: String(a.failureMessages?.[0] ?? 'No assertion detail').slice(0, 2000),
    }),
  );
if (!passed) process.exitCode = 1;
