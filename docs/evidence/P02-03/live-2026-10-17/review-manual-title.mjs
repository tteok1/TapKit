import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const baseline = read(join(dir, 'manual-title-baseline-2026-10-17.json'));
const sourceBaseline = read(join(dir, baseline.sourceSessionBaseline));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
const snapshotName = process.argv.find((a) => /^snapshot-\d+\.json$/.test(a));
const traceName = process.argv.find((a) => /^tool-trace-review-\d+\.json$/.test(a));
if (!snapshotName || !traceName) throw Error('Expected metadata reports');
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
  throw Error('Unexpected report binding');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args),
    one = (sql, ...args) => db.prepare(sql).get(...args);
  const sessionId = baseline.session.id;
  const session = one(
    `SELECT id,mode,project_id projectId,active_branch_id branchId,revision,title_manual titleManual,
   diagnostic_sha256(title) titleSHA256,diagnostic_sha256(note) noteSHA256,diagnostic_sha256(tags_json) tagsSHA256,archived_at archivedAt,title=? titleMatchesExpected
   FROM sessions WHERE id=? AND deleted_at IS NULL`,
    baseline.expectedTitle,
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
  const receipts = all(
    `SELECT rowid sequence,request_id requestId,command,state,expires_at-86400000 recordedAt,json_extract(reply_json,'$.reply.ok') ok,
   json_extract(reply_json,'$.reply.data.session.id') sessionId,json_extract(reply_json,'$.reply.data.session.title')=? replyTitleMatchesExpected
   FROM request_receipts WHERE owner_session_id=? AND expires_at-86400000>? AND command IN('sessions.update','sessions.read','sessions.title') ORDER BY rowid`,
    baseline.expectedTitle,
    sessionId,
    baseline.startedAfter,
  );
  const rename = receipts.filter((r) => r.command === 'sessions.update');
  const sourceTitle = one(
    'SELECT diagnostic_sha256(title) titleSHA256 FROM sessions WHERE id=? AND deleted_at IS NULL',
    sourceBaseline.sourceSession.id,
  );
  const oldLedger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
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
      (m) => m.id === old.id && Object.keys(old).every((key) => m[key] === old[key]),
    ),
  }));
  const checks = {
    oneManualRenameReceipt:
      rename.length === 1 &&
      rename[0].ok === 1 &&
      rename[0].state === 'completed' &&
      rename[0].sessionId === sessionId &&
      rename[0].replyTitleMatchesExpected === 1,
    exactManualTitlePersisted:
      session.titleMatchesExpected === 1 &&
      session.titleManual === 1 &&
      session.revision === baseline.session.revision + 1,
    otherMetadataAndBranchPreserved:
      ['mode', 'projectId', 'branchId', 'noteSHA256', 'tagsSHA256', 'archivedAt'].every(
        (k) => session[k] === baseline.session[k],
      ) && JSON.stringify(branch) === JSON.stringify(baseline.branch),
    bothMessageHashesAndProvenancePreserved:
      messages.length === baseline.messages.length && oldMessages.every((m) => m.preserved),
    originalTitleAndLedgerPreserved:
      sourceTitle.titleSHA256 === sourceBaseline.sourceSession.titleSHA256 &&
      hash(JSON.stringify(oldLedger)) === sourceBaseline.oldLedgerSHA256,
    reopenReceiptAfterRename:
      rename.length === 1 &&
      receipts.some(
        (r) => r.command === 'sessions.read' && r.ok === 1 && r.sequence > rename[0].sequence,
      ),
    noAIOrExecution:
      Object.keys(globalCounts).every((key) => globalCounts[key] === baseline.globalCounts[key]) &&
      !receipts.some((r) => r.command === 'sessions.title') &&
      trace.attempts.every((t) =>
        sourceBaseline.oldLedger.some((a) => a.attemptId === t.attemptId),
      ),
    idleNoUnsettledOrDuplicate:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
  };
  const reportName = 'manual-title-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'D-manual-title',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_manual_title_and_reopen'
      : 'observed_requires_review',
    checks,
    session,
    branch,
    receipts,
    oldMessages,
    globalCounts,
    humanConfirmation: '符合预期，可以继续下一项测试',
    baseline: 'manual-title-baseline-2026-10-17.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    limits:
      'Manual rename and leave/reopen on this forked copy only; no automatic-title race, explicit AI rename, all-provider or full-task acceptance implied.',
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-search')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Manual-title checks incomplete');
    const titleQuery = baseline.expectedTitle,
      messageQuery = 'P02E-1017R';
    const expectedUser = messages.find((m) => m.role === 'user');
    const profileId = one(
      'SELECT profile_id profileId FROM sessions WHERE id=?',
      sessionId,
    ).profileId;
    if (profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10')
      throw Error('Unexpected search profile');
    const preflight = (query, type, scope) =>
      all(
        `SELECT d.entity_id id,d.entity_type type,d.session_id sessionId,d.branch_id branchId FROM history_fts f JOIN history_search_documents d ON d.rowid=f.rowid JOIN sessions s ON s.id=d.session_id WHERE history_fts MATCH ? AND d.profile_id=? AND d.entity_type=? AND s.deleted_at IS NULL AND s.archived_at IS NULL ${scope ? 'AND d.session_id=?' : ''} ORDER BY d.entity_id`,
        '"' + query.replaceAll('"', '""') + '"',
        profileId,
        type,
        ...(scope ? [scope] : []),
      );
    const titleHits = preflight(titleQuery, 'session', null),
      messageHits = preflight(messageQuery, 'message', sessionId);
    if (
      titleHits.length !== 1 ||
      titleHits[0].id !== sessionId ||
      messageHits.length !== 1 ||
      messageHits[0].id !== expectedUser.id
    )
      throw Error('Search preflight is not unique');
    const historyBaseline = all(
      'SELECT id,updated_at updatedAt,query=? isTitleQuery,query=? isMessageQuery FROM search_history WHERE query IN(?,?) ORDER BY id',
      titleQuery,
      messageQuery,
      titleQuery,
      messageQuery,
    );
    const next = {
      task: 'P02-03',
      round: 'E-search-and-locate',
      status: 'prepared_waiting_two_user_searches',
      checkedAt: new Date().toISOString(),
      startedAfter: snapshot.capturedAt,
      dataDir: baseline.dataDir,
      caseId: baseline.caseId,
      session,
      messages,
      branch,
      globalCounts,
      priorAcceptance: reportName,
      titleQuery,
      messageQuery,
      titleSearch: { scope: { type: 'all' }, types: ['session'], expectedHits: titleHits },
      messageSearch: {
        scope: { type: 'session', id: sessionId },
        types: ['message'],
        expectedHits: messageHits,
      },
      historyBaseline,
      preflightLimit:
        'Read-only FTS/index ID preflight only. Did not call app search or write search history; UI behavior, highlighting and navigation remain unverified.',
      instructions:
        'From renamed copy, open 搜索/Ctrl+K. First select 全局 + 会话, query exact prepared title, click 查找 then the unique result. On reopened copy search again with 当前会话 + 消息 and P02E-1017R, inspect highlight then click the matching question. Confirm the title remains the renamed copy and exact message is located. Report both; no model send, archive or changes to source conversation.',
      acceptance:
        'User title-search and scoped message search return expected IDs and highlight/locate the copied user message, appropriate recent query metadata changes, message/branch hashes preserved and no model/tool/run/settlement. Scope excludes archived queries, sorting, search deletion/history privacy, other-project permissions and all search requirements.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'search-baseline-2026-10-17.json'),
      JSON.stringify(next, null, 2) + '\n',
      { flag: 'wx' },
    );
    report.searchPreflight = {
      titleHitCount: titleHits.length,
      messageHitCount: messageHits.length,
      preparedOnly: true,
    };
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
      globalCounts,
      searchPreflight: report.searchPreflight,
    }),
  );
} finally {
  db.close();
}
