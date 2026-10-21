import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read(join(dir, 'trash-baseline-2026-10-18.json'));
if (
  !/^docs\/evidence\/P02-03\/live-2026-10-17\/fork-baseline-2026-10-17\.json$/.test(
    baseline.sourceSessionBaseline,
  )
)
  throw Error('Unexpected source baseline');
const sourceBaseline = read(join(root, baseline.sourceSessionBaseline));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
const snapshotName = process.argv.find((a) => /^snapshot-\d+\.json$/.test(a));
const traceName = process.argv.find((a) => /^tool-trace-review-\d+\.json$/.test(a));
if (!snapshotName || !traceName) throw Error('Expected metadata report names');
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
const hash = (s) => createHash('sha256').update(s).digest('hex');
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args),
    one = (sql, ...args) => db.prepare(sql).get(...args);
  const id = baseline.session.id,
    profileId = one('SELECT profile_id profileId FROM sessions WHERE id=?', id)?.profileId;
  if (profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10')
    throw Error('Target row/profile missing');
  const session = one(
    'SELECT id,mode,project_id projectId,active_branch_id branchId,revision,title_manual titleManual,diagnostic_sha256(title) titleSHA256,diagnostic_sha256(note) noteSHA256,diagnostic_sha256(tags_json) tagsSHA256,archived_at archivedAt,deleted_at deletedAt,title=? titleMatchesExpected FROM sessions WHERE id=?',
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
    `SELECT r.rowid sequence,r.request_id requestId,r.command,r.state,r.expires_at-86400000 recordedAt,json_extract(r.reply_json,'$.reply.ok') ok,json_array_length(r.reply_json,'$.reply.data.updatedIds') updatedCount,json_array_length(r.reply_json,'$.reply.data.failed') failedCount FROM request_receipts r WHERE r.profile_id=? AND r.command IN('sessions.trash','sessions.restore','sessions.purge') AND r.expires_at-86400000>? AND EXISTS(SELECT 1 FROM json_each(r.reply_json,'$.reply.data.updatedIds') x WHERE x.value=?) ORDER BY r.rowid`,
    profileId,
    baseline.startedAfter,
    id,
  );
  const membership = one(
    'SELECT sum(CASE WHEN deleted_at IS NULL AND archived_at IS NULL THEN 1 ELSE 0 END) recentCount,sum(CASE WHEN deleted_at IS NULL AND archived_at IS NOT NULL THEN 1 ELSE 0 END) archivedCount,sum(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) trashCount FROM sessions WHERE id=? AND profile_id=?',
    id,
    profileId,
  );
  const projectionCount = one(
    'SELECT count(*) n FROM history_search_documents WHERE session_id=?',
    id,
  ).n;
  const titleFTSHits = one(
    'SELECT count(*) n FROM history_fts WHERE history_fts MATCH ?',
    '"' + baseline.titleQuery.replaceAll('"', '""') + '"',
  ).n;
  const sourceLedger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sourceBaseline.sourceSession.id,
  );
  const sourceState = one(
    'SELECT diagnostic_sha256(title) titleSHA256,archived_at archivedAt,deleted_at deletedAt FROM sessions WHERE id=?',
    sourceBaseline.sourceSession.id,
  );
  const oldMessages = baseline.messages.map((old) => ({
    id: old.id,
    preserved: messages.some(
      (m) => m.id === old.id && Object.keys(old).every((key) => m[key] === old[key]),
    ),
  }));
  const resourceState = {
    linkedResources: one(
      "SELECT count(*) n FROM resource_links WHERE owner_type='session' AND owner_id=? AND deleted_at IS NULL",
      id,
    ).n,
    attachmentRefs: one(
      "SELECT coalesce(sum(coalesce(json_array_length(chat_json,'$.attachments'),0)),0) n FROM messages WHERE session_id=? AND deleted_at IS NULL",
      id,
    ).n,
    memorySourceRefs: one(
      `SELECT count(DISTINCT m.id) n FROM memories m,json_each(m.source_ids_json) x WHERE m.profile_id=? AND m.deleted_at IS NULL AND CASE WHEN x.type='object' THEN json_extract(x.value,'$.messageId') ELSE x.value END IN(SELECT id FROM messages WHERE session_id=?)`,
      profileId,
      id,
    ).n,
  };
  const globalCounts = {
    runs: one('SELECT count(*) n FROM runs').n,
    attempts: one('SELECT count(*) n FROM provider_attempts').n,
    tools: one('SELECT count(*) n FROM tool_calls').n,
    ledger: one('SELECT count(*) n FROM usage_ledger').n,
  };
  const checks = {
    softDeletedTargetAndTrashMembership:
      session.deletedAt > baseline.startedAfter &&
      session.revision === baseline.session.revision + 1 &&
      membership.recentCount === 0 &&
      membership.archivedCount === 0 &&
      membership.trashCount === 1,
    oneSuccessfulTrashOnlyReceipt:
      receipts.length === 1 &&
      receipts[0].command === 'sessions.trash' &&
      receipts[0].state === 'completed' &&
      receipts[0].ok === 1 &&
      receipts[0].updatedCount === 1 &&
      receipts[0].failedCount === 0,
    titleAndOtherMetadataPreserved: Object.keys(baseline.session)
      .filter((key) => !['revision', 'deletedAt'].includes(key))
      .every((key) => session[key] === baseline.session[key]),
    bothMessageHashesAndBranchRetained:
      messages.length === baseline.messages.length &&
      oldMessages.every((m) => m.preserved) &&
      JSON.stringify(branch) === JSON.stringify(baseline.branch),
    ordinarySearchProjectionAndFTSRemoved: projectionCount === 0 && titleFTSHits === 0,
    noDependentResourcesOrMemorySources: Object.keys(resourceState).every(
      (key) => resourceState[key] === 0 && baseline.resourcePreflight[key] === 0,
    ),
    originalSourceAndLedgerPreserved:
      sourceState.titleSHA256 === sourceBaseline.sourceSession.titleSHA256 &&
      sourceState.archivedAt === null &&
      sourceState.deletedAt === null &&
      hash(JSON.stringify(sourceLedger)) === sourceBaseline.oldLedgerSHA256,
    noExecutionOrUsageChange:
      Object.keys(globalCounts).every((key) => globalCounts[key] === baseline.globalCounts[key]) &&
      JSON.stringify(snapshot.ledgerTotals) === JSON.stringify(baseline.ledgerTotals) &&
      trace.attempts.every((t) =>
        sourceBaseline.oldLedger.some((a) => a.attemptId === t.attemptId),
      ),
    userConfirmsMemoryPreviewAndLists: true,
    idleNoUnsettledOrDuplicate:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
  };
  const reportName = 'trash-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'G-trash-checkpoint',
    localDate: '2026-10-18',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_trash_checkpoint_restore_pending'
      : 'observed_requires_review',
    checks,
    session,
    branch,
    receipts,
    membership,
    oldMessages,
    projectionCount,
    titleFTSHits,
    resourceState,
    globalCounts,
    ledgerTotals: snapshot.ledgerTotals,
    humanConfirmation: '符合预期',
    evidenceBoundary:
      'The user confirms prescribed memory-preview/list behavior. Durable metadata independently confirms one target soft-delete, retained message hashes and removed search projection/FTS; no UI search-result click or preview telemetry is claimed.',
    limits:
      'This empty-resource synthetic copy soft deletion only. Recovery is pending; no permanent or batch deletion, linked-file recovery or nonzero-memory deletion acceptance implied.',
    baseline: 'trash-baseline-2026-10-18.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-restore')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Trash checkpoint incomplete');
    const user = messages.find((m) => m.role === 'user');
    const historyBaseline = all(
      'SELECT id,updated_at updatedAt FROM search_history WHERE profile_id=? AND query=?',
      profileId,
      baseline.messageQuery,
    );
    const next = {
      task: 'P02-03',
      round: 'G-restore-from-trash',
      localDate: '2026-10-18',
      status: 'prepared_waiting_one_user_restore_and_message_search',
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
      messageQuery: baseline.messageQuery,
      messageQueryHistoryBaseline: historyBaseline,
      expectedMessageHit: {
        id: user.id,
        type: 'message',
        sessionId: id,
        branchId: session.branchId,
      },
      expectedSearchProjectionAfterRestore: { session: 1, message: 2 },
      trashReceipt: receipts[0],
      resourcePreflight: resourceState,
      sourceSessionBaseline: baseline.sourceSessionBaseline,
      priorAcceptance: reportName,
      instructions:
        'In 聊天 → 回收站, select the checkbox for P02验收-分叉副本-1017 and click 恢复 once. Switch to 最近 and open it; verify title and both messages remain. Ctrl+K 当前会话 + 消息, search P02E-1017R and click its result to verify restored index/location. Report recovery and search. No permanent deletion or model sends/regeneration.',
      acceptance:
        'One subsequent sessions.restore receipt; deleted_at null/revision+1, active list and rebuilt projection/FTS contain the same session/messages, hashes/branch/title/old ledger unchanged, user confirms restored content and local message location with zero new executions. Until reviewed full G is pending.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'restore-baseline-2026-10-18.json'),
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
      membership,
      projectionCount,
      titleFTSHits,
      resourceState,
      globalCounts,
    }),
  );
} finally {
  db.close();
}
