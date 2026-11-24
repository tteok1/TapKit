import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readCurrentProbeResults } from './runtime-probe-results.mjs';
import { writeFile, mkdir, rename } from 'node:fs/promises';
import { executionFingerprint } from './runtime-inventory.mjs';
import { requiredCases } from './p00-03-required-cases.mjs';
import {
  verificationScope,
  readExecutionIdentity,
  isStandardUser,
  verificationScopeFailure,
} from './execution-verification.mjs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { root, nodeExe, lockedEnv } from './lib.mjs';
import { verifyPayload } from './installer/payload.mjs';
const args = process.argv.slice(2);
const installed = args[0] === '--installed';
const work = installed ? process.env.TAPKIT_NATIVE_PROBE_WORK_DIR : root;
if (!work || (installed && (!isAbsolute(work) || args.length !== 2 || !isAbsolute(args[1]))))
  throw Error('Installed probe requires isolated evidence and receipt paths.');
const destination = resolve(
  work,
  installed
    ? 'docs/evidence/P00-03'
    : (process.env.TAPKIT_RUNTIME_PROBE_EVIDENCE_DIR ?? 'docs/evidence/P00-03'),
);
const evidenceRelative = relative(join(work, 'docs/evidence'), destination);
if (
  isAbsolute(evidenceRelative) ||
  evidenceRelative === '..' ||
  evidenceRelative.startsWith('..\\') ||
  evidenceRelative.startsWith('../')
)
  throw new Error('Runtime probe evidence must stay inside docs/evidence');
const scope = verificationScope(installed ? ['--scope=current-user'] : args);
async function writeInstalledReport(report) {
  const receipt = args[1];
  const temporary = receipt + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, receipt);
}
if (installed) {
  try {
    await verifyPayload(resolve(root, '../..'));
  } catch (error) {
    const state = {
      status: 'failed',
      code: 'SANDBOX_UNAVAILABLE',
      reason: 'INSTALLATION_FILE_MISMATCH',
    };
    await writeInstalledReport({
      executionPolicy: 'appcontainer-lok-v1',
      capabilities: { nativeExecution: state, officeRender: state, terminal: state },
      component: String(error.message).split(':')[0],
    });
    process.exit(3);
  }
}
await mkdir(destination, { recursive: true });
const startedAt = new Date().toISOString();
const executionPolicy = 'appcontainer-lok-v1';
console.log('RUNTIME_PROBE_STAGE=fingerprint_before');
const beforeFingerprint = await executionFingerprint(root);
await mkdir(join(work, 'test-results'), { recursive: true });
const nativeReport = join(work, 'test-results', 'P00-03-native-' + randomUUID() + '.json');
console.log('RUNTIME_PROBE_STAGE=native_tests');
const test = spawnSync(
  nodeExe(),
  [
    ...(installed
      ? [
          join(root, 'node_modules/vitest/vitest.mjs'),
          'run',
          '--config',
          join(root, 'scripts/installer/probe.config.mjs'),
          '--configLoader=native',
        ]
      : [join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs'), 'test:integration', 'P00-03']),
    '--reporter=json',
    '--outputFile=' + nativeReport,
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
const results = await readCurrentProbeResults(nativeReport, startedAt);
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
const identity = readExecutionIdentity();
const standardUser = isStandardUser(identity);
console.log('RUNTIME_PROBE_STAGE=fingerprint_after');
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
      : missingCases.length > 0
        ? 'P00_ACCEPTANCE_INCOMPLETE'
        : verificationScopeFailure(scope, identity);
const state = reason
  ? { status: 'failed', code: 'SANDBOX_UNAVAILABLE', reason }
  : { status: 'available' };
const report = {
  schemaVersion: scope === 'current-user' ? 2 : 1,
  executionPolicy,
  startedAt,
  endedAt: new Date().toISOString(),
  command: installed
    ? 'TapKit packaged P00-03 native acceptance'
    : 'pnpm test:integration P00-03 --reporter=json --outputFile=' + nativeReport,
  exitCode: test.status,
  standardUser,
  ...(scope === 'current-user'
    ? { verification: { scope, identity }, standardUserAcceptance: 'not_verified_in_this_scope' }
    : {}),
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
if (installed) {
  await writeInstalledReport({
    ...report,
    failedCases: failedAssertions.map((item) => item.title),
  });
} else {
  await mkdir(join(root, 'resources/runtime'), { recursive: true });
  await writeFile(
    join(root, 'resources/runtime/capabilities.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
await writeFile(join(destination, 'runtime-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (reason) process.exitCode = 1;
