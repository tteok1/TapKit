import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read(join(dir, 'search-baseline-2026-10-17.json'));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
const snapshotName = process.argv.find((a) => /^snapshot-\d+\.json$/.test(a));
const traceName = process.argv.find((a) => /^tool-trace-review-\d+\.json$/.test(a));
if (!snapshotName || !traceName) throw Error('Expected scoped metadata reports');
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
  const sessionId = baseline.session.id;
  const profileId = one(
    'SELECT profile_id profileId FROM sessions WHERE id=?',
    sessionId,
  ).profileId;
  if (profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10') throw Error('Unexpected profile');
  const session = one(
    'SELECT id,mode,project_id projectId,active_branch_id branchId,revision,title_manual titleManual,diagnostic_sha256(title) titleSHA256,diagnostic_sha256(note) noteSHA256,diagnostic_sha256(tags_json) tagsSHA256,archived_at archivedAt,title=? titleMatchesExpected FROM sessions WHERE id=? AND deleted_at IS NULL',
    baseline.titleQuery,
    sessionId,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    sessionId,
  );
  const branch = one(
    'SELECT id,head_message_id headMessageId,revision FROM branches WHERE id=? AND deleted_at IS NULL',
    session.branchId,
  );
  const history = all(
    'SELECT id,updated_at updatedAt,query=? isTitleQuery,query=? isMessageQuery FROM search_history WHERE profile_id=? AND query IN(?,?) ORDER BY updated_at,id',
    baseline.titleQuery,
    baseline.messageQuery,
    profileId,
    baseline.titleQuery,
    baseline.messageQuery,
  );
  const historyChanges = history.map((row) => ({
    id: row.id,
    updatedAt: row.updatedAt,
    isTitleQuery: row.isTitleQuery,
    isMessageQuery: row.isMessageQuery,
    newOrUpdated: !baseline.historyBaseline.some(
      (old) => old.id === row.id && old.updatedAt === row.updatedAt,
    ),
  }));
  const ids = (query, type, scope) =>
    all(
      `SELECT d.entity_id id,d.entity_type type,d.session_id sessionId,d.branch_id branchId FROM history_fts f JOIN history_search_documents d ON d.rowid=f.rowid JOIN sessions s ON s.id=d.session_id WHERE history_fts MATCH ? AND d.profile_id=? AND d.entity_type=? AND s.deleted_at IS NULL AND s.archived_at IS NULL ${scope ? 'AND d.session_id=?' : ''} ORDER BY d.entity_id`,
      '"' + query.replaceAll('"', '""') + '"',
      profileId,
      type,
      ...(scope ? [scope] : []),
    );
  const titleHits = ids(baseline.titleQuery, 'session', null),
    messageHits = ids(baseline.messageQuery, 'message', sessionId);
  const navigation = all(
    `SELECT rowid sequence,request_id requestId,command,state,expires_at-86400000 recordedAt FROM request_receipts WHERE owner_session_id=? AND command IN('sessions.read','messages.switchBranch') AND expires_at-86400000>? ORDER BY rowid`,
    sessionId,
    baseline.startedAfter,
  );
  const globalCounts = {
    runs: one('SELECT count(*) n FROM runs').n,
    attempts: one('SELECT count(*) n FROM provider_attempts').n,
    tools: one('SELECT count(*) n FROM tool_calls').n,
    ledger: one('SELECT count(*) n FROM usage_ledger').n,
  };
  const metadataPreserved = Object.keys(baseline.session).every(
    (key) => session[key] === baseline.session[key],
  );
  const oldMessages = baseline.messages.map((old) => ({
    id: old.id,
    preserved: messages.some(
      (m) => m.id === old.id && Object.keys(old).every((key) => m[key] === old[key]),
    ),
  }));
  const knownTrace = read(join(dir, 'fork-baseline-2026-10-17.json')).oldLedger;
  const checks = {
    bothPreparedQueriesRecorded:
      historyChanges.length === 2 &&
      historyChanges.every((r) => r.newOrUpdated && r.updatedAt > baseline.startedAfter) &&
      historyChanges.some((r) => r.isTitleQuery === 1) &&
      historyChanges.some((r) => r.isMessageQuery === 1),
    titleIndexStillMatchesExpectedID:
      JSON.stringify(titleHits) === JSON.stringify(baseline.titleSearch.expectedHits),
    scopedMessageIndexStillMatchesExpectedID:
      JSON.stringify(messageHits) === JSON.stringify(baseline.messageSearch.expectedHits),
    sessionAndBranchPreserved:
      metadataPreserved && JSON.stringify(branch) === JSON.stringify(baseline.branch),
    bothMessagesPreserved:
      messages.length === baseline.messages.length && oldMessages.every((m) => m.preserved),
    userConfirmsHighlightAndCorrectNavigation: true,
    noModelToolOrSettlement:
      Object.keys(globalCounts).every((key) => globalCounts[key] === baseline.globalCounts[key]) &&
      trace.attempts.every((t) => knownTrace.some((a) => a.attemptId === t.attemptId)),
    idleNoUnsettledOrDuplicate:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
  };
  const reportName = 'search-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'E-search-and-locate',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_search_with_user_UI_confirmation'
      : 'observed_requires_review',
    checks,
    session,
    branch,
    historyChanges,
    titleIndexHits: titleHits,
    messageIndexHits: messageHits,
    navigation,
    oldMessages,
    globalCounts,
    humanConfirmation: '都正常，可以进行下一项验收',
    evidenceBoundary:
      'Persistent search_history records only query and last-used time, not actual request filters, returned hits, highlight ranges or clicked locator. Exact scope/highlight/visible destination are confirmed by the user, corroborated by existing unique index IDs and unchanged target hashes; not claimed to be independent runtime telemetry of those UI details.',
    limits:
      'These title and current-session message searches only. Sorting, archived filtering, deleting search history, cross-project permission filtering and all search requirements are not passed by this check.',
    baseline: 'search-baseline-2026-10-17.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-archive')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Search scope not complete');
    const next = {
      task: 'P02-03',
      round: 'F-archive-search',
      status: 'prepared_waiting_archive_filter_checkpoint',
      checkedAt: new Date().toISOString(),
      startedAfter: Date.now(),
      dataDir: baseline.dataDir,
      caseId: baseline.caseId,
      session,
      messages,
      branch,
      globalCounts,
      titleQuery: baseline.titleQuery,
      historyBaseline: history,
      priorAcceptance: reportName,
      expectedArchivedSearch: {
        scope: { type: 'all' },
        types: ['session'],
        includeArchivedTrue: baseline.titleSearch.expectedHits,
        includeArchivedFalse: [],
      },
      checkpoint:
        'User archives only this synthetic named copy, performs title search with 包括归档 checked and unchecked, then leaves it archived for metadata review. Cancellation of archive follows the intermediate check; never delete or archive original conversation.',
      instructions:
        'Right-click the named copy sidebar row and select 归档. Open 搜索/Ctrl+K, 全局 + 会话, query the prepared title: 包括归档 checked should find the copy; unchecked and 查找 again should have zero hits. Report both and leave the copy archived; do not restore it until this intermediate state is checked. No sends/regeneration/AI rename.',
      acceptance:
        'Intermediate archived_at non-null, one successful archive receipt linked by updatedIds to the copy, exact title/index/message hashes retained, user confirms includeArchived contrast, no execution/settlement. Then a separate restore checkpoint verifies 取消归档 and recent-list reappearance. Preparation is not acceptance.',
      sourceSessionBaseline: 'fork-baseline-2026-10-17.json',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'archive-baseline-2026-10-17.json'),
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
      historyChanges,
      titleIndexHits: titleHits,
      messageIndexHits: messageHits,
      navigation,
      globalCounts,
    }),
  );
} finally {
  db.close();
}
