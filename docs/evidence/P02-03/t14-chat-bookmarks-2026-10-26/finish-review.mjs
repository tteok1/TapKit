import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const read = (name) => readFileSync(join(dir, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const initial = json('electron.json');
const electron = json('electron-layout-final.json');
if (electron.exitCode !== 0 || !electron.historicalEvidenceRestored || !initial.historicalEvidenceRestored || !read('electron-layout-final.log').includes('1 passed') || !read('electron.log').includes('4 passed')) throw new Error('Electron verification incomplete');
if (!read('check.log').includes('0 failures.') || !read('check.log').includes('Total: 107 tests')) throw new Error('Static checks incomplete');
if (!read('docs-check.log').includes('All 37 task states')) throw new Error('Documentation check incomplete');
const snapshot = json('production-snapshot.json');
const frozen = json('source-frozen.json');
if (!snapshot.production.fixtureAbsent || JSON.stringify(snapshot.productSourceSha256) !== JSON.stringify(frozen.productSourceSha256)) throw new Error('Production source mismatch');
if (JSON.stringify(json('source-first.json').productSourceSha256) !== JSON.stringify(frozen.productSourceSha256)) throw new Error('Product changed between Electron rounds');
const scope = json('scope.json');
if (!scope.backendAndFeedbackSourceUnchanged) throw new Error('Unexpected backend change');
const results = {
  branch: 'codex/test-fixes-2026-10-26',
  baseCommit: '9bfc156af41f9a66fb4fff2a0842ff4c3582aa7a',
  completedLocalDate: '2026-10-26',
  status: 'chat_page_bookmark_entry_engineering_verified_manual_retest_pending',
  decision: 'docs/adr/0063-message-feedback-and-bookmark-collection.md',
  scope,
  checks: {
    check: { command: 'scripts/pnpm.ps1 check', exitCode: 0, log: 'check.log' },
    'docs:check': { command: 'scripts/pnpm.ps1 docs:check', exitCode: 0, log: 'docs-check.log' },
  },
  electron: {
    command: "verify-electron.ps1 -RunName electron-layout-final -Grep 'P02-03 T14 feedback and collection fit'",
    exitCode: 0, uniquePassedCases: 5, latestPassedCases: 1, allPassedInSingleRound: false,
    initialRound: { passed: 4, failed: 1, reason: 'hidden_sidebar_link_locator', receipt: initial },
    finalRound: { passed: 1, failed: 0, receipt: electron },
    themes: ['light', 'dark'],
    sizes: [[1440, 900, 1], [960, 640, 2]],
  },
  reusedBackendEvidence: { review: scope.previousReview, unit: 7, integration: 45, rerunForEntryMove: false },
  ...snapshot,
  boundaries: { originalProfileUntouched: true, originalWindowNotClosed: true, realProviderRequests: 0, committed: false, pushed: false, taskLiveAndGateStatesUnchanged: true },
};
writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`Ready: 5 distinct Electron tests across rounds, ${Object.keys(snapshot.productSourceSha256).length} product sources and ${Object.keys(snapshot.production.artifactSha256).length} artifacts`);
