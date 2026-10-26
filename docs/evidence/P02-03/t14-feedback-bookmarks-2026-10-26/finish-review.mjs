import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = fileURLToPath(new URL('.', import.meta.url));
const read = (name) => readFileSync(join(evidence, name), 'utf8');
const json = (name) => JSON.parse(read(name));
for (const [file, marker] of [
  ['unit-final.log', 'Tests  7 passed'],
  ['integration-final.log', 'Tests  45 passed'],
  ['check-final.log', '0 failures.'],
  ['check-final.log', 'Total: 107 tests'],
  ['docs-check-final.log', 'All 37 task states'],
  ['electron-focus-final.log', '2 passed'],
]) if (!read(file).includes(marker)) throw new Error(`Missing verification: ${file} ${marker}`);
const rounds = [
  { name: 'electron-first', passed: 0, failed: 6, reason: 'sandbox_process_launch_and_production_restore_denied' },
  { name: 'electron-local', passed: 2, failed: 4, reason: 'navigation_fixture_enumeration_and_overall_test_timeout' },
  { name: 'electron-final', passed: 5, failed: 1, reason: 'feedback_escape_focus_return' },
  { name: 'electron-focus-final', passed: 2, failed: 0, reason: null },
].map((round) => ({ ...round, receipt: json(round.name + '.json') }));
if (rounds.at(-1).receipt.exitCode !== 0 || rounds.some((round) => !round.receipt.historicalEvidenceRestored)) throw new Error('Electron or evidence restoration incomplete');
const frozen = json('source-frozen.json');
const layout = json('source-layout-confirmation.json');
const changedAfterLayout = Object.keys(frozen.productSourceSha256).filter((path) => frozen.productSourceSha256[path] !== layout.productSourceSha256[path]);
if (JSON.stringify(changedAfterLayout) !== JSON.stringify(['apps/desktop/src/renderer/src/message-history.tsx'])) throw new Error('Unexpected product changes after layout verification');
const snapshot = json('production-snapshot.json');
if (!snapshot.production.fixtureAbsent || JSON.stringify(frozen.productSourceSha256) !== JSON.stringify(snapshot.productSourceSha256)) throw new Error('Production source mismatch');
const results = {
  branch: 'codex/test-fixes-2026-10-26',
  baseCommit: '9bfc156af41f9a66fb4fff2a0842ff4c3582aa7a',
  completedLocalDate: '2026-10-26',
  status: 'engineering_verified_manual_T14_retest_pending',
  decision: 'docs/adr/0063-message-feedback-and-bookmark-collection.md',
  checks: {
    check: { command: 'scripts/pnpm.ps1 check', exitCode: 0, log: 'check-final.log' },
    'docs:check': { command: 'scripts/pnpm.ps1 docs:check', exitCode: 0, log: 'docs-check-final.log' },
    unit: { command: 'scripts/pnpm.ps1 test:unit P02-03 --maxWorkers=1', exitCode: 0, passed: 7, log: 'unit-final.log' },
    integration: { command: 'scripts/pnpm.ps1 test:integration P02-03.history', exitCode: 0, passed: 45, log: 'integration-final.log' },
  },
  electron: {
    exitCode: 0,
    uniquePassedCases: 6,
    allPassedInSingleRound: false,
    latestPassedCases: 2,
    command: "verify-electron.ps1 -RunName electron-focus-final -Grep 'P02-03 T14 feedback opens|P02-03 T06 two turns'",
    rounds,
    layout: { themes: ['light', 'dark'], sizes: [[1440, 900, 1], [960, 640, 2]], passRound: 'electron-final', changedAfterLayout, onlySubsequentProductChange: 'capture_explicit_feedback_trigger_for_focus_return' },
  },
  ...snapshot,
  boundaries: { originalProfileUntouched: true, originalWindowNotClosed: true, realProviderRequests: 0, committed: false, pushed: false, taskLiveAndGateStatesUnchanged: true },
};
writeFileSync(join(evidence, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`Review ready: ${Object.keys(snapshot.productSourceSha256).length} source hashes, ${Object.keys(snapshot.production.artifactSha256).length} artifacts, 6 distinct Electron cases across rounds`);
