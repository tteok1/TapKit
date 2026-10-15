import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pnpm, root, lockedEnv } from './lib.mjs';

export function runNativeProcesses({
  directory,
  provider,
  account,
  selectionHash,
  fixture = false,
}) {
  const runnerPath = join(root, '.test-data/P01-02-native-runner/runner.cjs');
  if (!existsSync(runnerPath)) throw new Error('P01-02 native runner must be built before launch');
  const caseId = randomUUID();
  const reportDir = join(root, 'test-results/P01-02-native', caseId);
  mkdirSync(reportDir, { recursive: true });
  const require = createRequire(import.meta.url);
  const env = lockedEnv();
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'TAPKIT_STARTUP_DIAGNOSTICS',
    'TAPKIT_TEST_BUILD',
    'NODE_OPTIONS',
  ])
    delete env[key];
  const phases = [];
  for (const phase of ['save', 'resume']) {
    const result = spawnSync(
      require('electron'),
      [
        runnerPath,
        phase,
        directory,
        provider,
        account,
        selectionHash,
        caseId,
        fixture ? 'fixture' : 'live',
      ],
      { cwd: root, env, windowsHide: true, timeout: 120_000, encoding: 'utf8' },
    );
    const reportPath = join(reportDir, phase + '-report.json');
    let report = null;
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {
      /* Fixed failure below; never echo child stderr. */
    }
    phases.push({ phase, exitCode: result.status, report });
    if (result.error || result.status !== 0 || report?.status !== 'passed') break;
  }
  const passed =
    phases.length === 2 &&
    phases.every((p) => p.exitCode === 0 && p.report?.status === 'passed') &&
    phases[1].report.actualProcessRestart &&
    phases[1].report.nativeLoadsDuringAdapter === 1;
  const summary = {
    task: 'P01-02',
    caseId,
    mode: fixture ? 'synthetic-dpapi' : 'live',
    checkedAt: new Date().toISOString(),
    status: passed ? 'passed' : 'failed',
    maximumRequests: 2,
    retries: 0,
    firstFailureStops: true,
    phases,
    ledgerScope: 'same-isolated-application-profile',
    ordinaryChatChanged: false,
  };
  const reportPath = join(reportDir, 'native-restart-report.json');
  writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  return { exitCode: passed ? 0 : 1, reportPath, summary };
}
export function runApiNativeLive(args) {
  const prepareOnly = args.includes('--prepare-only');
  const options = args.filter((arg) => !['--native-restart', '--prepare-only'].includes(arg));
  if (
    args.filter((a) => a === '--native-restart').length !== 1 ||
    args.filter((a) => a === '--prepare-only').length > 1 ||
    options.length !== 4 ||
    options[0] !== '--provider' ||
    options[1] !== 'openai-compatible' ||
    options[2] !== '--account' ||
    !options[3] ||
    !process.env.TAPKIT_LIVE_DATA_DIR ||
    (!prepareOnly && process.env.TAPKIT_API_NATIVE_LIVE !== '1')
  ) {
    console.error(
      'P01-02 native NOT RUN: --provider openai-compatible --account <label/ID> --native-restart requires an isolated app profile and explicit TAPKIT_API_NATIVE_LIVE=1.',
    );
    return 2;
  }
  try {
    pnpm(['exec', 'vite', 'build', '--config', 'tests/live/native.vite.config.ts']);
    const require = createRequire(import.meta.url);
    const { selectNativeAccount, nativeSelectionHash } = require(
      join(root, '.test-data/P01-02-native-runner/profile.cjs'),
    );
    const selection = selectNativeAccount(
      root,
      process.env.TAPKIT_LIVE_DATA_DIR,
      options[1],
      options[3],
    );
    console.log(
      JSON.stringify({
        ...selection,
        requests: 2,
        maximumOutputTokens: 256,
        nativeStorage: 'host-dpapi',
        ledger: 'application',
        prepareOnly,
      }),
    );
    if (prepareOnly) return 0;
    const result = runNativeProcesses({
      directory: process.env.TAPKIT_LIVE_DATA_DIR,
      provider: options[1],
      account: selection.accountId,
      selectionHash: nativeSelectionHash(selection),
    });
    console.log(JSON.stringify({ status: result.summary.status, reportPath: result.reportPath }));
    return result.exitCode;
  } catch {
    console.error(
      'P01-02 native could not complete. No automatic retry; inspect the current case report before running again.',
    );
    return 2;
  }
}
