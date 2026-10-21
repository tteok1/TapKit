import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read(join(dir, 'restore-baseline-2026-10-18.json'));
if (
  baseline.sourceSessionBaseline !==
  'docs/evidence/P02-03/live-2026-10-17/fork-baseline-2026-10-17.json'
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
const snapshot = read(join(support, snapshotName));
const trace = read(join(support, traceName));
if (
  original.root !== root ||
  realpathSync(original.dataDir) !== realpathSync(baseline.dataDir) ||
  snapshot.dataDir !== baseline.dataDir ||
  trace.caseId !== baseline.caseId ||
  snapshot.capturedAt <= baseline.startedAfter ||
  !trace.opened
)
  throw Error('Unexpected profile/case/time binding');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const id = baseline.session.id;
  const profileId = one('SELECT profile_id profileId FROM sessions WHERE id=?', id)?.profileId;
  if (profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10')
    throw Error('Unexpected target profile');
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
  const readReceipts = all(
    `SELECT rowid sequence,request_id requestId,command,state,expires_at-86400000 recordedAt,json_extract(reply_json,'$.reply.ok') ok FROM request_receipts WHERE profile_id=? AND owner_session_id=? AND command='sessions.read' AND expires_at-86400000>? ORDER BY rowid`,
    profileId,
    id,
    baseline.startedAfter,
  );
  const membership = one(
    'SELECT sum(CASE WHEN deleted_at IS NULL AND archived_at IS NULL THEN 1 ELSE 0 END) recentCount,sum(CASE WHEN deleted_at IS NULL AND archived_at IS NOT NULL THEN 1 ELSE 0 END) archivedCount,sum(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) trashCount FROM sessions WHERE id=? AND profile_id=?',
    id,
    profileId,
  );
  const projection = all(
    'SELECT entity_type type,count(*) n FROM history_search_documents WHERE session_id=? GROUP BY entity_type ORDER BY entity_type',
    id,
  );
  const ftsQuery = (q, type) =>
    all(
      `SELECT d.entity_id id,d.entity_type type,d.session_id sessionId,d.branch_id branchId FROM history_fts f JOIN history_search_documents d ON d.rowid=f.rowid JOIN sessions s ON s.id=d.session_id WHERE history_fts MATCH ? AND d.profile_id=? AND d.session_id=? AND d.entity_type=? AND s.deleted_at IS NULL ORDER BY d.entity_id`,
      '"' + q.replaceAll('"', '""') + '"',
      profileId,
      id,
      type,
    );
  const titleHits = ftsQuery(baseline.titleQuery, 'session');
  const messageHits = ftsQuery(baseline.messageQuery, 'message');
  const messageHistory = all(
    'SELECT id,updated_at updatedAt FROM search_history WHERE profile_id=? AND query=?',
    profileId,
    baseline.messageQuery,
  );
  const sourceLedger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sourceBaseline.sourceSession.id,
  );
  const sourceState = one(
    'SELECT diagnostic_sha256(title) titleSHA256,archived_at archivedAt,deleted_at deletedAt FROM sessions WHERE id=?',
    sourceBaseline.sourceSession.id,
  );
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
  const restore = receipts[0];
  const oldMessages = baseline.messages.map((m) => ({
    id: m.id,
    preserved: messages.some((n) => Object.keys(m).every((key) => n[key] === m[key])),
  }));
  const checks = {
    restoredRecentNotTrash:
      session.deletedAt === null &&
      session.archivedAt === null &&
      session.revision === baseline.session.revision + 1 &&
      membership.recentCount === 1 &&
      membership.archivedCount === 0 &&
      membership.trashCount === 0,
    oneSuccessfulRestoreOnlyReceipt:
      receipts.length === 1 &&
      restore.command === 'sessions.restore' &&
      restore.state === 'completed' &&
      restore.ok === 1 &&
      restore.updatedCount === 1 &&
      restore.failedCount === 0 &&
      restore.sequence > baseline.trashReceipt.sequence,
    titleAndMetadataPreserved: Object.keys(baseline.session)
      .filter((key) => !['revision', 'deletedAt'].includes(key))
      .every((key) => session[key] === baseline.session[key]),
    bothMessageHashesAndBranchPreserved:
      messages.length === baseline.messages.length &&
      oldMessages.every((m) => m.preserved) &&
      equal(branch, baseline.branch),
    searchProjectionAndExpectedFTSHitRebuilt:
      equal(projection, [
        { type: 'message', n: 2 },
        { type: 'session', n: 1 },
      ]) &&
      titleHits.length === 1 &&
      titleHits[0].id === id &&
      equal(messageHits, [baseline.expectedMessageHit]),
    queryUpdatedAfterRestore:
      messageHistory.length === 1 &&
      messageHistory[0].id === baseline.messageQueryHistoryBaseline[0].id &&
      messageHistory[0].updatedAt > restore?.recordedAt &&
      messageHistory[0].updatedAt > baseline.messageQueryHistoryBaseline[0].updatedAt,
    reopenedAfterRestore: readReceipts.some(
      (r) => r.ok === 1 && r.state === 'completed' && r.recordedAt > restore?.recordedAt,
    ),
    noDependentResourcesOrMemorySources: Object.keys(resourceState).every(
      (key) => resourceState[key] === 0 && baseline.resourcePreflight[key] === 0,
    ),
    originalSourceAndLedgerPreserved:
      sourceState.titleSHA256 === sourceBaseline.sourceSession.titleSHA256 &&
      sourceState.archivedAt === null &&
      sourceState.deletedAt === null &&
      hash(JSON.stringify(sourceLedger)) === sourceBaseline.oldLedgerSHA256,
    noExecutionOrUsageChange:
      equal(globalCounts, baseline.globalCounts) &&
      equal(snapshot.ledgerTotals, baseline.ledgerTotals) &&
      trace.attempts.every((t) =>
        sourceBaseline.oldLedger.some((a) => a.attemptId === t.attemptId),
      ),
    idleNoUnsettledOrDuplicate:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
    userConfirmsRestoredContentAndSearchLocation: true,
  };
  const reportName = 'restore-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'G-restore-from-trash',
    localDate: '2026-10-18',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_trash_restore_lifecycle'
      : 'observed_requires_review',
    checks,
    session,
    messages,
    branch,
    receipts,
    readReceipts,
    membership,
    projection,
    titleHits,
    messageHits,
    messageHistory,
    oldMessages,
    resourceState,
    globalCounts,
    ledgerTotals: snapshot.ledgerTotals,
    humanConfirmation: '符合预期，都正常',
    evidenceBoundary:
      'User confirms restored title/two messages, prescribed current-session/message filter and clicked location. Durable receipts/index/query chronology independently corroborate recovery; search_history does not record filters, hits, highlight ranges or click parameters.',
    limits:
      'Single synthetic copy with zero attachments/resources/memory-source refs. No permanent deletion, batch operation or nonzero dependency recovery acceptance. Only this G lifecycle is closed; task/stage remains externally pending.',
    baseline: 'restore-baseline-2026-10-18.json',
    priorTrashCheckpoint: baseline.priorAcceptance,
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-group')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Recovery review incomplete');
    const groupName = 'P02验收分组-1018';
    const sections = all(
      'SELECT id,revision,collapsed,sort_key sortKey,diagnostic_sha256(name) nameSHA256 FROM sidebar_sections WHERE profile_id=? ORDER BY id',
      profileId,
    );
    const nameConflictCount = one(
      'SELECT count(*) n FROM sidebar_sections WHERE profile_id=? AND name=?',
      profileId,
      groupName,
    ).n;
    const sidebarItem = all(
      "SELECT entity_type type,entity_id entityId,section_id sectionId,sort_key sortKey FROM sidebar_items WHERE profile_id=? AND entity_type='session' AND entity_id=?",
      profileId,
      id,
    );
    const otherItems = all(
      "SELECT entity_type type,entity_id entityId,section_id sectionId,sort_key sortKey FROM sidebar_items WHERE profile_id=? AND NOT(entity_type='session' AND entity_id=?) ORDER BY entity_type,entity_id",
      profileId,
      id,
    );
    if (
      nameConflictCount !== 0 ||
      sections.length >= 100 ||
      sidebarItem.some((i) => i.sectionId !== null)
    )
      throw Error('Group preflight requires review');
    const next = {
      task: 'P02-03',
      round: 'H-group-create-and-move',
      localDate: '2026-10-18',
      status: 'prepared_waiting_user_create_group_and_move_one_copy',
      checkedAt: new Date().toISOString(),
      startedAfter: Date.now(),
      dataDir: baseline.dataDir,
      caseId: baseline.caseId,
      profileId,
      session,
      messages,
      branch,
      resourcePreflight: resourceState,
      globalCounts,
      ledgerTotals: snapshot.ledgerTotals,
      projection,
      titleQuery: baseline.titleQuery,
      messageQuery: baseline.messageQuery,
      groupName,
      nameConflictCount,
      sections,
      sidebarItem,
      otherSidebarItemCount: otherItems.length,
      otherSidebarItemsSHA256: hash(JSON.stringify(otherItems)),
      receiptSequenceBaseline: one('SELECT coalesce(max(rowid),0) n FROM request_receipts').n,
      sourceSessionBaseline: baseline.sourceSessionBaseline,
      priorAcceptance: reportName,
      instructions:
        'Open 聊天; 新建分组 → name P02验收分组-1018 → 保存. For P02验收-分叉副本-1017 open ⋯/编辑, choose 分组 dropdown P02验收分组-1018 and 保存 once. Click the group, open the copy and confirm title/two messages. Leave the group in place and report; do not rename/delete group or send/regenerate/model calls yet.',
      expectedWritesByUserApplication:
        'One sidebar.create returns new group entityId; session edit/save may create one sessions.update revision7→8 with unchanged metadata hashes, then one sidebar.move targeting only this session and group. Session remains ordinary/unarchived/not deleted; messages/branch/ledger unchanged. Group creation/move/rename/delete not yet accepted.',
      nextCheckpointOnly:
        'First create and move; group rename/delete-preserves-content is a later checkpoint.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'group-baseline-2026-10-18.json'),
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
      receipts,
      readReceipts,
      membership,
      projection,
      messageHistory,
      globalCounts,
    }),
  );
} finally {
  db.close();
}
