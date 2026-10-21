import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const shared = join(root, 'docs/evidence/P02-02/live-2026-10-15');
const read = (name) => JSON.parse(readFileSync(join(shared, name), 'utf8'));
const save = (name, value) =>
  writeFileSync(join(shared, name), JSON.stringify(value, null, 2) + '\n');
const sha = (name) =>
  createHash('sha256')
    .update(readFileSync(join(root, name)))
    .digest('hex');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const ui = read('ui-read-1792238137698.json');
if (
  ui.status !== 'passed_public_ui_read' ||
  ui.modelRequests !== 0 ||
  ui.chatUi.messages !== 2 ||
  ui.accountUi.accounts !== 1
)
  throw Error('UI not verified');
const productChanges = git(['status', '--porcelain', '--', 'apps', 'packages', 'resources']);
const paths = productChanges.split('\n').map((line) => line.trim().replace(/^[A-Z?]{1,2}\s+/, ''));
if (
  paths.length !== 9 ||
  !paths.includes('packages/core/src/context-service.ts') ||
  paths.some((path) => !/^packages\/(core|providers)\/src\/[\w/.-]+\.ts$/.test(path))
)
  throw Error('Unexpected source changes');
const core = readFileSync(join(root, 'packages/core/dist/index.cjs'), 'utf8');
if (core.includes('installChatFixture') || !core.includes('source-data/1'))
  throw Error('Invalid production Core');
const sourcePath = 'packages/core/src/chat-service.ts';
const review = {
  task: 'P02-03',
  localDate: '2026-10-17',
  checkedAt: new Date().toISOString(),
  sourceCommit: git(['rev-parse', 'HEAD']),
  productChanges,
  sourcePath,
  sourceSHA256: sha(sourcePath),
  sources: paths.map((path) => ({ path, sha256: sha(path) })),
  coreBuildSHA256: sha('packages/core/dist/index.cjs'),
  mainBuildSHA256: sha('apps/desktop/out/main/index.js'),
  reviewedScope:
    'Preserved title-root repair and Zhipu wire aliases/opt-in trace, plus ADR0054 role isolation of source background and source-data/1 context provenance. No new IPC/schema/settings/tool authorization/native binding version.',
  validation: 'docs/evidence/P02-03/live-2026-10-17/background-priority-fix-2026-10-17.json',
  uiEvidence: 'ui-read-1792238137698.json',
  tests: {
    redFailed: 3,
    integrationPassed: 49,
    unitPassed: 11,
    checkFiles: 445,
    checkExitCode: 0,
    buildDesktopExitCode: 0,
  },
  productionCoreHasFixture: false,
};
save('reviewed-source-context-priority-2026-10-17.json', review);
const old = read('verified-build-tool-names-2026-10-17.json');
save('verified-build-context-priority-2026-10-17.json', {
  ...old,
  task: 'P02-03',
  checkedAt: review.checkedAt,
  sourceSHA256: review.sourceSHA256,
  sourceReview: 'reviewed-source-context-priority-2026-10-17.json',
  uiEvidence: review.uiEvidence,
  mode: review.reviewedScope,
  files: old.files.map(({ path }) => ({ path, sha256: sha(path) })),
});
const fix = {
  task: 'P02-03',
  localDate: '2026-10-17',
  status: 'engineering_verified_waiting_user_live_retest',
  observation: 'edit-observation-2026-10-17.json',
  runId: '01a149b1-1b37-738c-af7f-362ed8ec4318',
  attemptId: '01a149b1-1ec0-793e-b52f-a4b9b13ea156',
  actualTokens: 1259,
  observed:
    'New edited user input exact; new branch exists and old branch/messages/ledger preserved. HTTP200 only text/stop/tools0; answer 未执行工具 rather than 编辑分支成功. Five recalled old user instructions, two contain the prior no-tool phrase.',
  defect:
    'Memory/history source text was joined into trusted system wire. Verified request-role priority defect; consistency with live symptom does not independently prove all model choices.',
  repair:
    'History/memory source modules become one JSON user data message pinned before actual current user; trusted system rules stay separate. Same permissions/retrieval/source references/token budget; prompt provenance adds source-data/1.',
  checks: [
    {
      command: 'test:integration P02-03.background-priority --no-cache --fsModuleCache=false',
      exitCode: 1,
      failed: 3,
      log: 'background-priority-red.log',
    },
    {
      command:
        'test:integration P02-03.background-priority P02-03.history P04-02.context P04-03.memory P02-02.zhipu-tools --no-cache --fsModuleCache=false',
      exitCode: 0,
      passed: 49,
      log: 'background-priority-integration.log',
    },
    {
      command: 'test:unit P04-02.context --no-cache --fsModuleCache=false',
      exitCode: 0,
      passed: 11,
      log: 'background-priority-unit.log',
    },
    { command: 'check', exitCode: 0, files: 445, log: 'background-priority-check.log' },
    { command: 'build:desktop', exitCode: 0, log: 'background-priority-build.log' },
    {
      command: 'inspect-ui-read.mjs --session-id 01a1498f-dbb2-7fa8-8829-be6b985c7926',
      exitCode: 0,
      evidence: 'docs/evidence/P02-02/live-2026-10-15/ui-read-1792238137698.json',
    },
  ],
  fixtureLimit:
    'Fixed synthetic transport makes the bad-role condition observable, not a simulation of real LLM obedience. New live answer is still pending.',
  priorBranchEvidence: 'edit-baseline-2026-10-17.json',
  priorC: 'docs/evidence/P02-02/live-2026-10-15/round-c5-acceptance-2026-10-17.json',
  launchCleanup:
    'User confirmed tray/terminal exit; original-profile snapshot1792238042396 idle. Verified residual main31372/parent30832 stopped before build; prior launcher95232 exit1 recorded, not a normal-exit pass. Repaired production public UI diagnostic then exited normally.',
  reviewedSources:
    'docs/evidence/P02-02/live-2026-10-15/reviewed-source-context-priority-2026-10-17.json',
  verifiedBuild:
    'docs/evidence/P02-02/live-2026-10-15/verified-build-context-priority-2026-10-17.json',
  sourceDataSystemRoleInvariant:
    'history.background and memory.background text is never in prepared systemModules; wrapper remains counted source data before explicit user messages.',
  taskStatus: 'implemented_not_live_verified',
  stageStatus: 'engineering_passed_external_pending',
  agentModelRequests: 0,
  credentialOrNativeBodiesRead: 0,
  messageBodiesExported: false,
  manualBusinessDatabaseWrites: 0,
  commitOrPush: false,
};
writeFileSync(
  join(dir, 'background-priority-fix-2026-10-17.json'),
  JSON.stringify(fix, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    sources: paths.length,
    artifacts: old.files.length,
    coreSHA256: review.coreBuildSHA256,
  }),
);
