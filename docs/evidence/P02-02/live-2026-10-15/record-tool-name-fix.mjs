import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));
const save = (path, value) => writeFileSync(join(dir, path), JSON.stringify(value, null, 2) + '\n');
const sha = (path) =>
  createHash('sha256')
    .update(readFileSync(join(root, path)))
    .digest('hex');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const ui = read('ui-read-1792224049335.json');
if (ui.status !== 'passed_public_ui_read' || ui.modelRequests !== 0)
  throw Error('Expected reviewed public UI pass');
const previous = read('reviewed-source-2026-10-17.json');
const productChanges = git(['status', '--porcelain', '--', 'apps', 'packages', 'resources']);
const paths = productChanges.split('\n').map((line) => line.trim().replace(/^[A-Z?]{1,2}\s+/, ''));
if (
  paths.length !== 8 ||
  paths.some((path) => !/^packages\/(core|providers)\/src\/[\w/.-]+\.ts$/.test(path))
)
  throw Error('Unexpected repair scope');
const corePath = 'packages/core/dist/index.cjs';
if (readFileSync(join(root, corePath), 'utf8').includes('installChatFixture'))
  throw Error('Fixture in production');
const review = {
  ...previous,
  checkedAt: new Date().toISOString(),
  productChanges,
  sourceCommit: git(['rev-parse', 'HEAD']),
  sources: paths.map((path) => ({ path, sha256: sha(path) })),
  coreBuildSHA256: sha(corePath),
  mainBuildSHA256: sha('apps/desktop/out/main/index.js'),
  reviewedScope:
    'Existing title repair and opt-in trace plus ADR0053 exact Zhipu Chat tool aliases; canonical permissions/native schema remain compatible. No actual provider request by agent.',
  validation: 'tool-name-fix-2026-10-17.json',
  uiEvidence: 'ui-read-1792224049335.json',
  tests: { unit: 76, integration: 6, checkFiles: 443, checkExitCode: 0, buildDesktopExitCode: 0 },
};
if (sha(review.sourcePath) !== review.sourceSHA256) throw Error('Title repair changed');
save('reviewed-source-tool-names-2026-10-17.json', review);
const oldBuild = read('verified-build-2026-10-17.json');
save('verified-build-tool-names-2026-10-17.json', {
  ...oldBuild,
  checkedAt: review.checkedAt,
  sourceReview: 'reviewed-source-tool-names-2026-10-17.json',
  uiEvidence: review.uiEvidence,
  mode: review.reviewedScope,
  files: oldBuild.files.map(({ path }) => ({ path, sha256: sha(path) })),
});
save('tool-name-fix-2026-10-17.json', {
  task: 'P02-02',
  localDate: '2026-10-17',
  status: 'engineering_verified_waiting_one_user_live_attempt',
  c3Observation: 'round-c3-observation-2026-10-17.json',
  officialContract: 'official-tool-name-contract-2026-10-17.json',
  adr: 'docs/adr/0053-zhipu-chat-tool-name-aliases.md',
  defect:
    'Canonical dotted names violated official FunctionObject.name regex; original HTTP200 lacked tool proposals. Sole causal attribution still unproven.',
  repair:
    'Map three read-tool names in declarations and assistant history/private prefixes; only names declared in this request may decode before canonical argument validation. Trace adds fixed aliases only.',
  nativeCompatibility:
    'Schema/binding version unchanged: canonical names unchanged and old/new private wire prefixes both re-encoded idempotently. Fresh-adapter fixture regression covers both; no real native body read.',
  red: {
    command:
      'test:integration tests/integration/P02-02.zhipu-tools.test.ts --no-cache --fsModuleCache=false',
    exitCode: 1,
    failed: 2,
    log: 'tool-name-red-2026-10-17.log',
  },
  checks: [
    {
      command:
        'test:unit P02-02.zhipu-tool-names P02-02.tool-trace P01-02.api --no-cache --fsModuleCache=false',
      exitCode: 0,
      passed: 76,
      log: 'tool-name-unit-2026-10-17.log',
    },
    {
      command: 'test:integration P02-02.zhipu-tools P01-02.zhipu --no-cache --fsModuleCache=false',
      exitCode: 0,
      passed: 6,
      log: 'tool-name-integration-2026-10-17.log',
    },
    { command: 'check', exitCode: 0, files: 443, log: 'tool-name-check-2026-10-17.log' },
    { command: 'build:desktop', exitCode: 0, log: 'tool-name-build-2026-10-17.log' },
    {
      command: 'inspect-ui-read.mjs',
      exitCode: 0,
      report: review.uiEvidence,
      accounts: 1,
      messages: 12,
    },
  ],
  launchCleanup:
    'User confirmed full exit; scoped process check still found prior launch main29272/parent26352. Read-only workload snapshot1792223948886 was idle. Stopped only verified main; prior launcher46803 exited1, not a normal-exit pass. UI diagnostic for repaired build then closed normally.',
  diagnosticFailures: [
    'Sandbox public-document socket access and CIM process read denied; current Windows user read-only retries succeeded. No policy/global config change.',
  ],
  sourceReview: 'reviewed-source-tool-names-2026-10-17.json',
  verifiedBuild: 'verified-build-tool-names-2026-10-17.json',
  agentModelRequests: 0,
  keyOrNativeBodiesRead: 0,
  messageBodiesRead: 0,
  manualBusinessDatabaseWrites: 0,
  currentScope:
    'C only; A/B reused, other real providers/protocols deferred. No commit/push. Task implemented_not_live_verified and stage engineering_passed_external_pending remain.',
});
console.log(
  JSON.stringify({
    sources: paths.length,
    artifacts: oldBuild.files.length,
    coreSHA256: review.coreBuildSHA256,
  }),
);
