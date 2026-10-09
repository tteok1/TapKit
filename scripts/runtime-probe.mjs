import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { executionFingerprint } from './runtime-inventory.mjs';
import { requiredCases } from './p00-03-required-cases.mjs';
import { join } from 'node:path';
import { root, nodeExe, lockedEnv } from './lib.mjs';
const destination = join(root, 'docs/evidence/P00-03');
await mkdir(destination, { recursive: true });
const startedAt = new Date().toISOString();
const executionPolicy = 'appcontainer-lok-v1';
const beforeFingerprint = await executionFingerprint(root);
await mkdir(join(root, 'test-results'), { recursive: true });
const test = spawnSync(
  nodeExe(),
  [
    join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
    'test:integration',
    'P00-03',
    '--reporter=json',
    '--outputFile=test-results/P00-03-native.json',
  ],
  {
    cwd: root,
    env: lockedEnv(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  },
);
await writeFile(
  join(destination, 'runtime-probe.log'),
  String(test.stdout ?? '') + String(test.stderr ?? ''),
);
let results;
try {
  results = JSON.parse(await readFile(join(root, 'test-results/P00-03-native.json'), 'utf8'));
} catch {
  results = null;
}
// JSON-only Vitest reports otherwise hide the failing case from CI console logs.
// This probe runs only the fixed synthetic P00-03 acceptance suite.
const failedAssertions = (results?.testResults ?? []).flatMap((file) =>
  (file.assertionResults ?? [])
    .filter((item) => item.status === 'failed')
    .map((item) => ({
      title: String(item.title).slice(0, 300),
      reason: String(item.failureMessages?.[0] ?? 'No assertion detail')
        .split('\n')[0]
        .slice(0, 2000),
    })),
);
if (failedAssertions.length)
  console.error('NATIVE_ACCEPTANCE_FAILURES', JSON.stringify(failedAssertions.slice(0, 30)));
const groupProbe = spawnSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
  encoding: 'utf8',
  windowsHide: true,
});
const standardUser =
  groupProbe.status === 0 &&
  !groupProbe.stdout.includes('S-1-5-32-544') &&
  groupProbe.stdout.includes('S-1-16-8192');
const fingerprint = await executionFingerprint(root);
const passedCases = new Set(
  (results?.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? [])
      .filter((item) => item.status === 'passed')
      .map((item) => `${String(file.name).replaceAll('\\', '/')}::${item.title}`),
  ),
);
const missingCases = requiredCases
  .filter(
    ([file, title]) =>
      ![...passedCases].some((name) => name.endsWith(`/tests/integration/${file}::${title}`)),
  )
  .map(([file, title]) => `${file}: ${title}`);
const cleanRun =
  test.status === 0 &&
  results?.numTotalTests > 0 &&
  results?.numFailedTests === 0 &&
  results?.numPendingTests === 0;
const reason =
  beforeFingerprint !== fingerprint
    ? 'PROBE_SOURCE_CHANGED_DURING_RUN'
    : !cleanRun
      ? 'NATIVE_ACCEPTANCE_FAILED'
      : !standardUser
        ? 'STANDARD_USER_VERIFICATION_REQUIRED'
        : missingCases.length > 0
          ? 'P00_ACCEPTANCE_INCOMPLETE'
          : null;
const state = reason
  ? { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason }
  : { status: 'available' };
const report = {
  schemaVersion: 1,
  executionPolicy,
  startedAt,
  endedAt: new Date().toISOString(),
  command:
    'pnpm test:integration P00-03 --reporter=json --outputFile=test-results/P00-03-native.json',
  exitCode: test.status,
  standardUser,
  fingerprint,
  capabilities: { nativeExecution: state, officeRender: state, terminal: state },
  tests: results
    ? {
        total: results.numTotalTests,
        passed: results.numPassedTests,
        failed: results.numFailedTests,
        pending: results.numPendingTests,
      }
    : null,
  missingCases,
};
await mkdir(join(root, 'resources/runtime'), { recursive: true });
await writeFile(
  join(root, 'resources/runtime/capabilities.json'),
  JSON.stringify(report, null, 2) + '\n',
);
await writeFile(join(destination, 'runtime-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (reason) process.exitCode = 1;
