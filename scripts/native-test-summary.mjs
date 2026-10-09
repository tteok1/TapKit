import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const base = resolve(process.argv[2] ?? '.');
const report = JSON.parse(
  await readFile(join(base, 'test-results', process.argv[3] ?? 'P00-03-native.json'), 'utf8'),
);
console.log(
  JSON.stringify(
    {
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      failures: report.testResults
        .filter((s) => s.status === 'failed')
        .map((s) => ({
          suite: s.name.replaceAll('\\', '/').split('/').slice(-2).join('/'),
          error: String(s.message ?? '').slice(0, 1800),
          cases: s.assertionResults
            .filter((t) => t.status === 'failed')
            .map((t) => ({
              name: t.fullName,
              errors: t.failureMessages.map((m) => m.slice(0, 1800)),
            })),
        })),
    },
    null,
    2,
  ),
);
