import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const evidence = fileURLToPath(new URL('.', import.meta.url));
const checks = JSON.parse(await readFile(join(evidence, 'final-checks.json'), 'utf8'));
const summary = JSON.parse(await readFile(join(evidence, 'automation-summary.json'), 'utf8'));
const native = JSON.parse(await readFile(join(evidence, 'native-files-result.json'), 'utf8'));
const retryLog = await readFile(join(evidence, 'check-retry.log'), 'utf8');
if (!retryLog.includes('Total: 107 tests in 32 files') || !retryLog.includes('0 failures.')) throw new Error('Incomplete check retry log');
if (checks.filter(c=>c.name!=='check').some(c=>c.exitCode!==0)) throw new Error('Final check remains failed');
if (!native.sourceUnchanged || !native.downloadMatches || !native.externalCopyMatches) throw new Error('Native data hash audit not passed');
const retryStat = await stat(join(evidence, 'check-retry.log'));
const outcome = {
  date: '2026-10-26',
  automaticTests: summary.totals,
  totalAutomaticPassed: Object.values(summary.totals).reduce((a,b)=>a+b,0),
  finalChecks: checks.map(c => c.name==='check' ? { name: 'check', finalExitCode: 0, initialAttempt: c, retry: { runner: 'exec_command', sessionId: 27466, observedExitCode: 0, command: "& '.\\scripts\\pnpm.ps1' check *> 'docs/evidence/P03-01/acceptance-2026-10-26/check-retry.log'", log: 'check-retry.log', logCreatedUtc: retryStat.birthtime.toISOString(), logModifiedUtc: retryStat.mtime.toISOString() } } : { name: c.name, finalExitCode:c.exitCode, log:c.log }),
  productSourceUnchanged: true,
  historicalEvidenceRestored: summary.batches.every(b=>b.historicalEvidenceRestored),
  nativeFileAndFolderPicker: 'passed', nativeSaveAndBytes: 'passed', externalCopyBytesAndDefaultAppLaunch: 'passed',
  manualPending: ['M01 Windows Explorer cross-window file drag and drop', 'M02 default application rendered text'],
  manualChecklist: 'manual-checklist.md',
  originalProfileTestMutations: false, realModelRequests: false, commitOrPush: false,
  limitations: ['First P03-02 Electron startup-precondition failure retained before five-test success', 'Native helper closing snapshot failed; persisted state independently audited read-only', 'Notepad rendering approval timed out; not claimed passed', 'Initial final-check environment/document errors and subsequent check timeout retained with successful retry', 'User-agreed real-model/non-admin/provider/deferred exclusions remain unchanged']
};
await writeFile(join(evidence, 'final-outcome.json'), JSON.stringify(outcome, null, 2)+'\n');
console.log(JSON.stringify({ automaticPassed:outcome.totalAutomaticPassed, finalChecks:outcome.finalChecks.map(c=>({name:c.name,exitCode:c.finalExitCode})), manualPending:outcome.manualPending }));
