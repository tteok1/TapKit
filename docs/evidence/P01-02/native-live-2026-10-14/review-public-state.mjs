import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, basename, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../..');
const caseId = '8c0fc973-e4c8-4ece-b1c4-4232d0e4a9c4';
const reportDirectory = join(root, 'test-results/P01-02-native', caseId);
const manifest = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
const engineering = JSON.parse(
  readFileSync(join(root, 'docs/evidence/P01-02/native-restart-2026-10-13/results.json'), 'utf8'),
);
const dataDir = realpathSync(manifest.dataDir);
if (
  manifest.root !== root ||
  dirname(dataDir) !== join(root, '.test-data') ||
  !basename(dataDir).startsWith('P01-02-app-zhipu-chat-')
)
  throw new Error('Unexpected isolated profile binding');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = {};
for (const [file, expected] of Object.entries(engineering.sourceHashes)) {
  const actual = hash(readFileSync(join(root, file)));
  if (actual !== expected) throw new Error('Source differs from validated engineering snapshot');
  sourceHashes[file] = actual;
}
for (const [key, file] of [
  ['runner', 'runner.cjs'],
  ['profile', 'profile.cjs'],
]) {
  if (
    hash(readFileSync(join(root, '.test-data/P01-02-native-runner', file))) !==
    engineering.runnerHashes[key]
  )
    throw new Error('Runner differs from validated bundle');
}
const publicReports = {};
const reportHashes = {};
for (const file of ['native-restart-report.json', 'save-report.json', 'resume-report.json']) {
  const bytes = readFileSync(join(reportDirectory, file));
  const text = bytes.toString('utf8');
  if (/"nativeRef"\s*:|TAPKIT_NATIVE_OK|P01-02-synthetic-key/.test(text))
    throw new Error('Unexpected private content in public report');
  publicReports[file] = JSON.parse(text);
  reportHashes[file] = hash(bytes);
}
const combined = publicReports['native-restart-report.json'];
const save = publicReports['save-report.json'];
const resume = publicReports['resume-report.json'];
if (
  combined.status !== 'passed' ||
  combined.mode !== 'live' ||
  combined.caseId !== caseId ||
  combined.maximumRequests !== 2 ||
  combined.retries !== 0 ||
  combined.phases.length !== 2
)
  throw new Error('Unexpected combined report');
for (const [i, phase] of ['save', 'resume'].entries()) {
  const report = phase === 'save' ? save : resume;
  if (
    combined.phases[i].phase !== phase ||
    combined.phases[i].exitCode !== 0 ||
    JSON.stringify(combined.phases[i].report) !== JSON.stringify(report)
  )
    throw new Error('Phase reports differ');
  if (
    report.caseId !== caseId ||
    report.phase !== phase ||
    report.status !== 'passed' ||
    report.attempts !== 1 ||
    report.retries !== 0 ||
    report.nativeSaves !== 1 ||
    report.maximumOutputTokens !== 128 ||
    report.tools !== 0 ||
    report.automaticTitleOrMemoryRequests !== 0 ||
    report.settingsChanged ||
    !report.resultMarkerMatched ||
    !report.encryptedFileExists ||
    !report.plaintextMarkerAbsent ||
    !report.ledgerVerified ||
    !report.reservationsReleased ||
    report.duplicateSettlements !== 0 ||
    report.usage.source !== 'actual'
  )
    throw new Error('Phase acceptance criteria failed');
}
if (
  save.pid === resume.pid ||
  save.instanceId === resume.instanceId ||
  !resume.actualProcessRestart ||
  !resume.encryptedCanonicalRestored ||
  !resume.nativeRefSupplied ||
  !resume.nativeReuseConfirmed ||
  resume.nativeLoadsDuringAdapter !== 1
)
  throw new Error('Restart or reuse evidence missing');
const { selectNativeAccount, nativeSelectionHash } = createRequire(import.meta.url)(
  join(root, '.test-data/P01-02-native-runner/profile.cjs'),
);
const selection = selectNativeAccount(root, dataDir, 'openai-compatible', 'test1');
// The checkpoint contains identifiers and binding hashes only. Never expose its native reference.
const checkpoint = JSON.parse(readFileSync(join(reportDirectory, 'checkpoint.json'), 'utf8'));
if (
  checkpoint.caseId !== caseId ||
  checkpoint.state !== 'completed' ||
  checkpoint.profileId !== selection.profileId ||
  checkpoint.selectionHash !== nativeSelectionHash(selection) ||
  checkpoint.firstPid !== save.pid ||
  checkpoint.firstInstanceId !== save.instanceId
)
  throw new Error('Completed checkpoint binding differs');
const db = new DatabaseSync(join(dataDir, 'db/app.sqlite'), { readOnly: true });
let state;
try {
  db.exec('BEGIN');
  if (db.prepare('PRAGMA user_version').get().user_version !== 14)
    throw new Error('Unexpected schema');
  const ledger = db
    .prepare(
      `SELECT a.id attemptId,a.logical_call_id logicalCallId,a.status,a.error_code errorCode,a.attempt_no attemptNo,a.budget_day budgetDay,
    u.account_id accountId,u.source,u.charged_tokens chargedTokens,u.input_tokens inputTokens,u.output_tokens outputTokens,u.cached_input_tokens cachedInputTokens,u.reasoning_tokens reasoningTokens,u.amount_micros amountMicros,u.currency
    FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.root_run_id=? ORDER BY a.created_at,a.attempt_no`,
    )
    .all(checkpoint.rootRunId);
  if (
    ledger.length !== 2 ||
    ledger[0].logicalCallId !== checkpoint.firstCallId ||
    new Set(ledger.map((row) => row.attemptId)).size !== 2 ||
    new Set(ledger.map((row) => row.logicalCallId)).size !== 2
  )
    throw new Error('Unexpected number or identity of scoped attempts');
  for (const [i, row] of ledger.entries()) {
    const report = i === 0 ? save : resume;
    if (
      row.accountId !== selection.accountId ||
      row.status !== 'completed' ||
      row.errorCode !== null ||
      row.attemptNo !== 1 ||
      row.source !== report.usage.source ||
      row.chargedTokens !== report.usage.chargedTokens ||
      row.inputTokens !== report.usage.inputTokens ||
      row.outputTokens !== report.usage.outputTokens
    )
      throw new Error('Report differs from formal ledger');
  }
  const totals = db
    .prepare(
      "SELECT count(*) entries,coalesce(sum(charged_tokens),0) chargedTokens,coalesce(sum(CASE WHEN source='actual' THEN charged_tokens ELSE 0 END),0) actualTokens,coalesce(sum(CASE WHEN source='estimated' THEN charged_tokens ELSE 0 END),0) estimatedTokens FROM usage_ledger",
    )
    .get();
  const unsettledAttempts = db
    .prepare(
      'SELECT count(*) n FROM provider_attempts WHERE id NOT IN (SELECT provider_attempt_id FROM usage_ledger)',
    )
    .get().n;
  const duplicateSettlements = db
    .prepare(
      'SELECT count(*) n FROM (SELECT provider_attempt_id FROM usage_ledger GROUP BY provider_attempt_id HAVING count(*)>1)',
    )
    .get().n;
  const reservedBudgets = db
    .prepare('SELECT count(*) n FROM budgets WHERE reserved_tokens<>0')
    .get().n;
  const rootBudget = db
    .prepare(
      "SELECT used_tokens usedTokens,reserved_tokens reservedTokens FROM budgets WHERE owner_kind='root' AND owner_id=? AND deleted_at IS NULL",
    )
    .get(checkpoint.rootRunId);
  const preferences = db
    .prepare(
      "SELECT revision,json_extract(value_json,'$.values.dailyTokenLimit') dailyTokenLimit FROM settings WHERE key='modelPreferences' AND scope_type='profile' AND scope_id=? AND deleted_at IS NULL",
    )
    .get(selection.profileId);
  const opaqueRows = db
    .prepare(
      'SELECT a.native_state_ref ref FROM provider_attempts a JOIN opaque_states b ON b.id=a.native_state_ref WHERE a.root_run_id=? AND b.profile_id=? AND b.account_id=? AND b.deleted_at IS NULL',
    )
    .all(checkpoint.rootRunId, selection.profileId, selection.accountId);
  const filesPresent = opaqueRows.filter((row) => {
    const file = join(dataDir, 'secrets', 'opaque-' + row.ref);
    if (!existsSync(file)) return false;
    const part = relative(dataDir, realpathSync(file));
    return part && !part.startsWith('..') && !isAbsolute(part);
  }).length;
  if (
    unsettledAttempts ||
    duplicateSettlements ||
    reservedBudgets ||
    opaqueRows.length !== 2 ||
    filesPresent !== 2 ||
    preferences.dailyTokenLimit !== 2000000 ||
    rootBudget?.usedTokens !== save.usage.chargedTokens + resume.usage.chargedTokens ||
    rootBudget.reservedTokens !== 0
  )
    throw new Error('Ledger, index, file existence or budget invariant failed');
  state = {
    rootRunId: checkpoint.rootRunId,
    ledger,
    scopedActualTokens: ledger.reduce((sum, row) => sum + row.chargedTokens, 0),
    totals,
    unsettledAttempts,
    duplicateSettlements,
    reservedBudgets,
    rootBudget: rootBudget ?? null,
    preferences,
    opaqueIndexEntries: opaqueRows.length,
    encryptedFilesPresent: filesPresent,
    encryptedFileContentsRead: false,
  };
  db.exec('ROLLBACK');
} finally {
  db.close();
}
const review = {
  checkedAt: new Date().toISOString(),
  task: 'P01-02',
  status: 'scoped_native_restart_live_passed',
  caseId,
  sourceReport: relative(root, join(reportDirectory, 'native-restart-report.json')).replaceAll(
    '\\',
    '/',
  ),
  sourceReportCheckedAt: combined.checkedAt,
  resource: 'R13',
  config: selection.config,
  accountRevision: selection.accountRevision,
  actualProcessRestart: true,
  distinctPids: [save.pid, resume.pid],
  encryptedCanonicalRestored: true,
  nativeLoadsDuringAdapter: 1,
  nativeReuseConfirmed: true,
  modelRequestsByUser: 2,
  retries: 0,
  automaticTitleOrMemoryRequests: 0,
  agentModelRequests: 0,
  agentRealKeyReads: 0,
  agentNativeContentReads: 0,
  readOnlyDatabase: true,
  ordinaryChatChanged: false,
  settingsChanged: false,
  checkpointState: checkpoint.state,
  state,
  sourceHashes,
  reportHashes,
  acceptanceScope:
    'Zhipu openai-compatible/openai-chat/glm-4.7-flashx dedicated two-process Host-DPAPI adapter reuse and same-profile ledger',
  excludes: [
    'ordinary ChatService native selection policy',
    'other models/protocols/providers',
    'background title network stability',
    'price or monetary budget verification',
    'Codex account acceptance',
  ],
  taskStatus: 'in_progress',
  p01Gate: 'failed',
  commitOrPush: false,
  ciPolling: false,
};
for (const [file, report] of Object.entries(publicReports))
  writeFileSync(join(directory, file), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
writeFileSync(join(directory, 'review.json'), JSON.stringify(review, null, 2) + '\n', {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    status: review.status,
    scopedActualTokens: state.scopedActualTokens,
    totals: state.totals,
    unsettledAttempts: state.unsettledAttempts,
    duplicateSettlements: state.duplicateSettlements,
    reservedBudgets: state.reservedBudgets,
    reportPath: join(directory, 'review.json'),
  }),
);
