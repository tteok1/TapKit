import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const baseline = read(join(dir, 'archive-baseline-2026-10-17.json'));
const sourceBaseline = read(join(dir, baseline.sourceSessionBaseline));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
const snapshotName = process.argv.find((a) => /^snapshot-\d+\.json$/.test(a));
const traceName = process.argv.find((a) => /^tool-trace-review-\d+\.json$/.test(a));
if (!snapshotName || !traceName) throw Error('Expected scoped metadata report names');
const support = join(root, 'docs/evidence/P02-02/live-2026-10-15');
const snapshot = read(join(support, snapshotName)),
  trace = read(join(support, traceName));
if (
  original.root !== root ||
  realpathSync(original.dataDir) !== realpathSync(baseline.dataDir) ||
  snapshot.dataDir !== baseline.dataDir ||
  trace.caseId !== baseline.caseId ||
  snapshot.capturedAt <= baseline.startedAfter
)
  throw Error('Unexpected profile/case/time binding');
const priorSearch = read(join(dir, baseline.priorAcceptance));
if (!/^docs\/evidence\/P02-02\/live-2026-10-15\/snapshot-\d+\.json$/.test(priorSearch.source))
  throw Error('Unexpected prior snapshot path');
const before = read(join(root, priorSearch.source));
const hash = (s) => createHash('sha256').update(s).digest('hex');
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args),
    one = (sql, ...args) => db.prepare(sql).get(...args);
  const id = baseline.session.id;
  const profileId = one('SELECT profile_id profileId FROM sessions WHERE id=?', id).profileId;
  if (profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10') throw Error('Unexpected profile');
  const session = one(
    'SELECT id,mode,project_id projectId,active_branch_id branchId,revision,title_manual titleManual,diagnostic_sha256(title) titleSHA256,diagnostic_sha256(note) noteSHA256,diagnostic_sha256(tags_json) tagsSHA256,archived_at archivedAt,title=? titleMatchesExpected FROM sessions WHERE id=? AND deleted_at IS NULL',
    baseline.titleQuery,
    id,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    id,
  );
  const branch = one(
    'SELECT id,head_message_id headMessageId,revision FROM branches WHERE id=? AND deleted_at IS NULL',
    session.branchId,
  );
  const receipts = all(
    `SELECT r.rowid sequence,r.request_id requestId,r.command,r.state,r.expires_at-86400000 recordedAt,
   json_extract(r.reply_json,'$.reply.ok') ok,json_array_length(r.reply_json,'$.reply.data.updatedIds') updatedCount,json_array_length(r.reply_json,'$.reply.data.failed') failedCount
   FROM request_receipts r WHERE r.profile_id=? AND r.command='sessions.archive' AND r.expires_at-86400000>? AND EXISTS(SELECT 1 FROM json_each(r.reply_json,'$.reply.data.updatedIds') x WHERE x.value=?) ORDER BY r.rowid`,
    profileId,
    baseline.startedAfter,
    id,
  );
  const history = all(
    'SELECT id,updated_at updatedAt FROM search_history WHERE profile_id=? AND query=?',
    profileId,
    baseline.titleQuery,
  );
  const hits = (includeArchived) =>
    all(
      `SELECT d.entity_id id,d.entity_type type,d.session_id sessionId,d.branch_id branchId FROM history_fts f JOIN history_search_documents d ON d.rowid=f.rowid JOIN sessions s ON s.id=d.session_id WHERE history_fts MATCH ? AND d.profile_id=? AND d.entity_type='session' AND s.deleted_at IS NULL ${includeArchived ? '' : 'AND s.archived_at IS NULL'} ORDER BY d.entity_id`,
      '"' + baseline.titleQuery.replaceAll('"', '""') + '"',
      profileId,
    );
  const includedHits = hits(true),
    excludedHits = hits(false);
  const membership = one(
    'SELECT sum(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) recentCount,sum(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) archivedCount FROM sessions WHERE id=? AND profile_id=? AND deleted_at IS NULL',
    id,
    profileId,
  );
  const oldMessages = baseline.messages.map((old) => ({
    id: old.id,
    preserved: messages.some(
      (m) => m.id === old.id && Object.keys(old).every((key) => m[key] === old[key]),
    ),
  }));
  const sourceLedger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sourceBaseline.sourceSession.id,
  );
  const sourceTitle = one(
    'SELECT diagnostic_sha256(title) titleSHA256,archived_at archivedAt,deleted_at deletedAt FROM sessions WHERE id=?',
    sourceBaseline.sourceSession.id,
  );
  const globalCounts = {
    runs: one('SELECT count(*) n FROM runs').n,
    attempts: one('SELECT count(*) n FROM provider_attempts').n,
    tools: one('SELECT count(*) n FROM tool_calls').n,
    ledger: one('SELECT count(*) n FROM usage_ledger').n,
  };
  const checks = {
    archivedCheckpointState:
      session.archivedAt > baseline.startedAfter &&
      session.revision === baseline.session.revision + 1 &&
      membership.recentCount === 0 &&
      membership.archivedCount === 1,
    oneSuccessfulArchiveReceipt:
      receipts.length === 1 &&
      receipts[0].ok === 1 &&
      receipts[0].state === 'completed' &&
      receipts[0].updatedCount === 1 &&
      receipts[0].failedCount === 0,
    exactIncludeExcludeIDs:
      JSON.stringify(includedHits) ===
        JSON.stringify(baseline.expectedArchivedSearch.includeArchivedTrue) &&
      JSON.stringify(excludedHits) ===
        JSON.stringify(baseline.expectedArchivedSearch.includeArchivedFalse),
    userConfirmsVisibleFilterResults: true,
    sameTitleAndOtherMetadata: Object.keys(baseline.session)
      .filter((k) => !['archivedAt', 'revision'].includes(k))
      .every((key) => session[key] === baseline.session[key]),
    bothMessagesAndBranchPreserved:
      messages.length === baseline.messages.length &&
      oldMessages.every((m) => m.preserved) &&
      JSON.stringify(branch) === JSON.stringify(baseline.branch),
    titleQueryUpdatedAfterArchive:
      history.length === 1 && history[0].updatedAt > session.archivedAt,
    originalSourceAndLedgerPreserved:
      sourceTitle.titleSHA256 === sourceBaseline.sourceSession.titleSHA256 &&
      sourceTitle.archivedAt === null &&
      sourceTitle.deletedAt === null &&
      hash(JSON.stringify(sourceLedger)) === sourceBaseline.oldLedgerSHA256,
    noExecutionOrUsageChange:
      Object.keys(globalCounts).every((key) => globalCounts[key] === baseline.globalCounts[key]) &&
      JSON.stringify(snapshot.ledgerTotals) === JSON.stringify(before.ledgerTotals) &&
      trace.attempts.every((t) =>
        sourceBaseline.oldLedger.some((a) => a.attemptId === t.attemptId),
      ),
    idleNoUnsettledOrDuplicate:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
  };
  const reportName = 'archive-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'F-archive-search-checkpoint',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_archive_filter_checkpoint_restore_pending'
      : 'observed_requires_review',
    checks,
    session,
    branch,
    receipts,
    history,
    includedIndexHits: includedHits,
    excludedIndexHits: excludedHits,
    membership,
    oldMessages,
    globalCounts,
    ledgerTotals: snapshot.ledgerTotals,
    humanConfirmation: '符合预期，可以进行下一项验收',
    evidenceBoundary:
      'The current archived state and successful target archive receipt are independently verified. Current include/exclude index IDs corroborate the expected filter; actual UI toggles and visible results are user-confirmed because search_history stores no request filters/results. Not claiming each UI request was independently logged.',
    limits:
      'Archive and include/exclude search checkpoint only; cancellation of archive and return to recent list remain pending. No full task/stage or cross-project search pass.',
    baseline: 'archive-baseline-2026-10-17.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-unarchive')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Archive checkpoint incomplete');
    const next = {
      task: 'P02-03',
      round: 'F-cancel-archive',
      status: 'prepared_waiting_one_user_unarchive',
      checkedAt: new Date().toISOString(),
      startedAfter: Date.now(),
      dataDir: baseline.dataDir,
      caseId: baseline.caseId,
      session,
      messages,
      branch,
      globalCounts,
      ledgerTotals: snapshot.ledgerTotals,
      titleQuery: baseline.titleQuery,
      archiveReceipt: receipts[0],
      priorAcceptance: reportName,
      sourceSessionBaseline: baseline.sourceSessionBaseline,
      instructions:
        'Close search, open left 聊天 page and its 归档 filter. Right-click only P02验收-分叉副本-1017 and choose 取消归档 once. Switch to 最近, open it, verify its two messages and title are intact. Report result. No sends/regeneration/recheck/restart.',
      acceptance:
        'One subsequent successful sessions.archive receipt for this target, archived_at null/revision+1/recent membership, prior hashes/title/branch/old ledger and global usage preserved, user confirms list restoration. Until checked F remains incomplete.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'unarchive-baseline-2026-10-17.json'),
      JSON.stringify(next, null, 2) + '\n',
      { flag: 'wx' },
    );
  }
  db.exec('COMMIT');
  writeFileSync(join(dir, reportName), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      reportPath: join(dir, reportName),
      status: report.status,
      checks,
      session,
      receipts,
      includedIndexHits: includedHits,
      excludedIndexHits: excludedHits,
      membership,
      globalCounts,
    }),
  );
} finally {
  db.close();
}
