import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const priorDir = join(root, 'docs/evidence/P02-03/live-2026-10-17');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const baseline = read(join(priorDir, 'unarchive-baseline-2026-10-17.json'));
const sourceBaseline = read(join(priorDir, baseline.sourceSessionBaseline));
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
  const id = baseline.session.id;
  const profileId = one('SELECT profile_id profileId FROM sessions WHERE id=?', id).profileId;
  if (profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10') throw Error('Unexpected profile');
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
    `SELECT r.rowid sequence,r.request_id requestId,r.command,r.state,r.expires_at-86400000 recordedAt,json_extract(r.reply_json,'$.reply.ok') ok,json_array_length(r.reply_json,'$.reply.data.updatedIds') updatedCount,json_array_length(r.reply_json,'$.reply.data.failed') failedCount FROM request_receipts r WHERE r.profile_id=? AND r.command='sessions.archive' AND r.expires_at-86400000>? AND EXISTS(SELECT 1 FROM json_each(r.reply_json,'$.reply.data.updatedIds') x WHERE x.value=?) ORDER BY r.rowid`,
    profileId,
    baseline.startedAfter,
    id,
  );
  const readReceipts = all(
    "SELECT rowid sequence,request_id requestId,expires_at-86400000 recordedAt,state FROM request_receipts WHERE owner_session_id=? AND command='sessions.read' AND expires_at-86400000>? ORDER BY rowid",
    id,
    baseline.startedAfter,
  );
  const messageHistory = all(
    'SELECT id,updated_at updatedAt FROM search_history WHERE profile_id=? AND query=?',
    profileId,
    baseline.archivedMessageSearch.query,
  );
  const messageHits = all(
    `SELECT d.entity_id id,d.entity_type type,d.session_id sessionId,d.branch_id branchId FROM history_fts f JOIN history_search_documents d ON d.rowid=f.rowid JOIN sessions s ON s.id=d.session_id WHERE history_fts MATCH ? AND d.profile_id=? AND d.session_id=? AND d.entity_type='message' AND s.deleted_at IS NULL ORDER BY d.entity_id`,
    '"' + baseline.archivedMessageSearch.query + '"',
    profileId,
    id,
  );
  const membership = one(
    'SELECT sum(CASE WHEN archived_at IS NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) recentCount,sum(CASE WHEN archived_at IS NOT NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) archivedCount FROM sessions WHERE id=? AND profile_id=?',
    id,
    profileId,
  );
  const sourceLedger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sourceBaseline.sourceSession.id,
  );
  const sourceState = one(
    'SELECT diagnostic_sha256(title) titleSHA256,archived_at archivedAt,deleted_at deletedAt FROM sessions WHERE id=?',
    sourceBaseline.sourceSession.id,
  );
  const globalCounts = {
    runs: one('SELECT count(*) n FROM runs').n,
    attempts: one('SELECT count(*) n FROM provider_attempts').n,
    tools: one('SELECT count(*) n FROM tool_calls').n,
    ledger: one('SELECT count(*) n FROM usage_ledger').n,
  };
  const oldMessages = baseline.messages.map((old) => ({
    id: old.id,
    preserved: messages.some(
      (m) => m.id === old.id && Object.keys(old).every((k) => m[k] === old[k]),
    ),
  }));
  const checks = {
    restoredStateAndRecentMembership:
      session.archivedAt === null &&
      session.deletedAt === null &&
      session.revision === baseline.session.revision + 1 &&
      membership.recentCount === 1 &&
      membership.archivedCount === 0,
    oneSubsequentSuccessfulUnarchiveReceipt:
      receipts.length === 1 &&
      receipts[0].sequence > baseline.archiveReceipt.sequence &&
      receipts[0].ok === 1 &&
      receipts[0].state === 'completed' &&
      receipts[0].updatedCount === 1 &&
      receipts[0].failedCount === 0,
    titleAndOtherMetadataPreserved: Object.keys(baseline.session)
      .filter((k) => !['archivedAt', 'revision'].includes(k))
      .every((key) => session[key] === baseline.session[key]),
    bothMessageHashesAndBranchPreserved:
      messages.length === baseline.messages.length &&
      oldMessages.every((m) => m.preserved) &&
      JSON.stringify(branch) === JSON.stringify(baseline.branch),
    archivedMessageQueryRecordedBeforeRestore:
      messageHistory.length === 1 &&
      messageHistory[0].updatedAt > baseline.startedAfter &&
      messageHistory[0].updatedAt < (receipts[0]?.recordedAt ?? 0) &&
      !baseline.messageQueryHistoryBaseline.some(
        (h) => h.id === messageHistory[0].id && h.updatedAt === messageHistory[0].updatedAt,
      ),
    currentIndexMatchesPreparedCopiedMessage:
      JSON.stringify(messageHits) === JSON.stringify(baseline.archivedMessageSearch.expectedHits),
    userConfirmsArchivedLocationAndRestore: true,
    openedRestoredTarget:
      receipts.length === 1 &&
      readReceipts.some((r) => r.sequence > receipts[0].sequence && r.state === 'completed'),
    originalSourceAndLedgerPreserved:
      sourceState.titleSHA256 === sourceBaseline.sourceSession.titleSHA256 &&
      sourceState.archivedAt === null &&
      sourceState.deletedAt === null &&
      hash(JSON.stringify(sourceLedger)) === sourceBaseline.oldLedgerSHA256,
    noExecutionOrUsageChange:
      Object.keys(globalCounts).every((k) => globalCounts[k] === baseline.globalCounts[k]) &&
      JSON.stringify(snapshot.ledgerTotals) === JSON.stringify(baseline.ledgerTotals) &&
      trace.attempts.every((t) =>
        sourceBaseline.oldLedger.some((a) => a.attemptId === t.attemptId),
      ),
    idleNoUnsettledOrDuplicate:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
  };
  const reportName = 'unarchive-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'F-archived-message-and-unarchive',
    localDate: '2026-10-18',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_archive_search_location_and_unarchive'
      : 'observed_requires_review',
    checks,
    session,
    branch,
    receipts,
    readReceipts,
    messageHistory,
    currentMessageIndex: messageHits,
    membership,
    oldMessages,
    globalCounts,
    ledgerTotals: snapshot.ledgerTotals,
    humanConfirmation: '定位和恢复都正常',
    priorCheckpoint: 'docs/evidence/P02-03/live-2026-10-17/' + baseline.priorAcceptance,
    evidenceBoundary:
      'Archived state and its message index were captured before this step; the marker query timestamp precedes the cancellation receipt, and the user confirms archived-message location. Runtime query filters, highlight ranges and clicked locator are not independently logged. Actual current restoration and post-restore read are corroborated by durable metadata.',
    limits:
      'This synthetic copy archive/search/location/unarchive cycle only. Full search/privacy/cross-project behavior, other providers and full P02-03/stage are not passed.',
    baseline: 'docs/evidence/P02-03/live-2026-10-17/unarchive-baseline-2026-10-17.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-trash')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Unarchive scope not complete');
    const linkedResources = one(
      "SELECT count(*) n FROM resource_links WHERE owner_type='session' AND owner_id=? AND deleted_at IS NULL",
      id,
    ).n;
    const attachmentRefs = one(
      "SELECT coalesce(sum(coalesce(json_array_length(chat_json,'$.attachments'),0)),0) n FROM messages WHERE session_id=? AND deleted_at IS NULL",
      id,
    ).n;
    const memorySourceRefs = one(
      `SELECT count(DISTINCT m.id) n FROM memories m,json_each(m.source_ids_json) x WHERE m.profile_id=? AND m.deleted_at IS NULL AND CASE WHEN x.type='object' THEN json_extract(x.value,'$.messageId') ELSE x.value END IN(SELECT id FROM messages WHERE session_id=?)`,
      profileId,
      id,
    ).n;
    if (linkedResources || attachmentRefs || memorySourceRefs)
      throw Error(
        'Synthetic copy acquired linked resources or memory sources; review before trash',
      );
    const next = {
      task: 'P02-03',
      round: 'G-trash-checkpoint',
      localDate: '2026-10-18',
      status: 'prepared_waiting_one_user_move_to_trash',
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
      messageQuery: baseline.archivedMessageSearch.query,
      sourceSessionBaseline:
        'docs/evidence/P02-03/live-2026-10-17/' + baseline.sourceSessionBaseline,
      priorAcceptance: reportName,
      resourcePreflight: { linkedResources, attachmentRefs, memorySourceRefs },
      instructions:
        'Right-click only P02验收-分叉副本-1017 and choose 移入回收站. In the app confirmation the three memory impact counts are expected zero; then click 删除会话并处理记忆 once. Verify disappearance from 最近 and presence in 聊天 → 回收站. Leave it there for metadata inspection before restoring. No permanent deletion, messages or regeneration.',
      acceptance:
        'One successful sessions.trash receipt/target deleted_at/revision+1, hidden from ordinary lists/search and present in trash, retained original two message hashes/branch/numeric ledger with no new executions. Intermediate checkpoint only; restore follows after inspection. Permanent deletion excluded.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'trash-baseline-2026-10-18.json'),
      JSON.stringify(next, null, 2) + '\n',
      { flag: 'wx' },
    );
    report.trashPreparation = { preparedOnly: true, ...next.resourcePreflight };
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
      messageHistory,
      readReceipts,
      membership,
      globalCounts,
      trashPreparation: report.trashPreparation,
    }),
  );
} finally {
  db.close();
}
