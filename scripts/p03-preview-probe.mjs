import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root, nodeExe, lockedEnv } from './lib.mjs';
const cases = [
  'P03-02 native preview converts six DOCX/PPTX samples through verified isolation and publishes fixed immutable caches',
  'P03-02 native preview refuses late revoked scope after real Office finishes and retains the original',
  'P03-02 native preview cancels the last observer, drains its Job and retries from the same untouched original',
  'P03-02 native preview converts an Office original in a deep private workspace without accepting caller path aliases',
];
const destination = join(root, 'docs/evidence/P03-02'),
  startedAt = new Date().toISOString();
await mkdir(destination, { recursive: true });
await mkdir(join(root, 'test-results'), { recursive: true });
const result = spawnSync(
  nodeExe(),
  [
    join(root, '.cache/tools/pnpm/package/bin/pnpm.mjs'),
    'test:integration',
    'P03-02.native-preview',
    '--reporter=json',
    '--outputFile=test-results/P03-02-native-preview.json',
  ],
  {
    cwd: root,
    env: lockedEnv(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 600000,
    maxBuffer: 16 * 1024 * 1024,
  },
);
await writeFile(
  join(destination, 'preview-probe.log'),
  String(result.stdout ?? '') + String(result.stderr ?? ''),
);
let tests = null;
try {
  tests = JSON.parse(await readFile(join(root, 'test-results/P03-02-native-preview.json'), 'utf8'));
} catch {
  /* Absent reports fail. */
}
const assertions = (tests?.testResults ?? []).flatMap((file) => file.assertionResults ?? []),
  missingCases = cases.filter(
    (title) => !assertions.some((a) => a.title === title && a.status === 'passed'),
  );
const groups = spawnSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
  standardUser =
    groups.status === 0 &&
    !groups.stdout.includes('S-1-5-32-544') &&
    groups.stdout.includes('S-1-16-8192');
const sources = [
  'packages/core/src/artifact-service.ts',
  'packages/core/src/preview-staging.ts',
  'packages/contracts/src/artifacts.ts',
  'packages/storage/src/artifacts.ts',
  'packages/retrieval/src/ingest/office.ts',
  'tests/fixtures/P03-preview-office.mjs',
  'native/windows-helper/src/office.rs',
  'native/windows-helper/src/lok_worker.py',
  'tests/integration/P03-02.native-preview.test.ts',
  'vitest.config.ts',
  'native/windows-helper/src/sandbox.rs',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(join(root, file)))
        .digest('hex'),
    ]),
  ),
);
const passed =
  result.status === 0 &&
  standardUser &&
  missingCases.length === 0 &&
  tests?.numTotalTests === cases.length &&
  tests.numFailedTests === 0 &&
  tests.numPendingTests === 0;
const report = {
  schemaVersion: 1,
  task: 'P03-02',
  startedAt,
  endedAt: new Date().toISOString(),
  command:
    'pnpm test:integration P03-02.native-preview --reporter=json --outputFile=test-results/P03-02-native-preview.json',
  exitCode: result.status,
  standardUser,
  sourceHashes,
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
await writeFile(join(destination, 'preview-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
for (const assertion of assertions.filter((a) => a.status === 'failed'))
  console.error(
    'P03_PREVIEW_FAILURE',
    JSON.stringify({
      title: assertion.title,
      reason: String(assertion.failureMessages?.[0] ?? 'No detail').slice(0, 2000),
    }),
  );
if (!passed) process.exitCode = 1;
