import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(dir, '../../../..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const baseline = read(join(dir, 'fork-baseline-2026-10-17.json'));
const snapshotName = process.argv.find((a) => /^snapshot-\d+\.json$/.test(a));
const traceName = process.argv.find((a) => /^tool-trace-review-\d+\.json$/.test(a));
if (!snapshotName || !traceName) throw Error('Expected scoped report names');
const support = join(root, 'docs/evidence/P02-02/live-2026-10-15');
const snapshot = read(join(support, snapshotName)),
  trace = read(join(support, traceName));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
if (
  original.root !== root ||
  realpathSync(original.dataDir) !== realpathSync(baseline.dataDir) ||
  snapshot.dataDir !== baseline.dataDir ||
  trace.caseId !== baseline.caseId ||
  snapshot.capturedAt <= baseline.startedAfter
)
  throw Error('Unexpected profile/case binding');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args),
    one = (sql, ...args) => db.prepare(sql).get(...args);
  const sourceId = baseline.sourceSession.id;
  const source = one(
    'SELECT id,mode,project_id projectId,active_branch_id branchId,revision,diagnostic_sha256(title) titleSHA256,title_manual titleManual FROM sessions WHERE id=? AND deleted_at IS NULL',
    sourceId,
  );
  const branches = all(
    'SELECT id,parent_branch_id parentId,fork_message_id forkMessageId,candidate_for_message_id candidateFor,head_message_id headMessageId,revision FROM branches WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,id',
    sourceId,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,provider_attempt_id attemptId,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    sourceId,
  );
  const newSessions = all(
    `SELECT n.id,n.mode,n.project_id projectId,n.active_branch_id branchId,n.revision,n.title_manual titleManual,
   n.title=substr(s.title,1,234)||' · 副本' titleMatchesCopy,
   n.note=s.note noteMatches,n.tags_json=s.tags_json tagsMatch
   FROM sessions n CROSS JOIN sessions s WHERE s.id=? AND n.deleted_at IS NULL ORDER BY n.created_at,n.id`,
    sourceId,
  ).filter((s) => !baseline.sessionIds.includes(s.id));
  const copy = newSessions.length === 1 ? newSessions[0] : null;
  const copiedBranches = copy
    ? all(
        'SELECT id,parent_branch_id parentId,fork_message_id forkMessageId,candidate_for_message_id candidateFor,head_message_id headMessageId,revision FROM branches WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,id',
        copy.id,
      )
    : [];
  const copiedMessages = copy
    ? all(
        "SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,source_message_id sourceMessageId,diagnostic_sha256(content_json) contentSHA256,client_message_id clientMessageId,provider_attempt_id attemptId,json_extract(chat_json,'$.errorCode') errorCode FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid",
        copy.id,
      )
    : [];
  const mapping = baseline.sourcePath.map((old, i) => {
    const current = copiedMessages[i];
    return {
      originalMessageId: old.id,
      expectedProvenance: old.sourceMessageId ?? old.id,
      copiedMessageId: current?.id,
      matches:
        !!current &&
        current.sourceMessageId === (old.sourceMessageId ?? old.id) &&
        current.contentSHA256 === old.contentSHA256 &&
        current.role === old.role &&
        current.status === old.status &&
        current.runId === old.runId &&
        current.clientMessageId === null &&
        current.attemptId === null &&
        current.parentId === (i ? copiedMessages[i - 1].id : null),
    };
  });
  const oldMessages = baseline.messages.map((old) => ({
    id: old.id,
    preserved: messages.some(
      (m) =>
        m.id === old.id &&
        [
          'branchId',
          'parentId',
          'role',
          'status',
          'runId',
          'revision',
          'sourceMessageId',
          'contentSHA256',
        ].every((key) => m[key] === old[key]),
    ),
  }));
  const oldBranches = baseline.branches.map((old) => ({
    id: old.id,
    preserved: branches.some(
      (b) => b.id === old.id && Object.keys(old).every((key) => b[key] === old[key]),
    ),
  }));
  const oldLedger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sourceId,
  );
  const receipts = all(
    `SELECT rowid sequence,request_id requestId,command,state,expires_at-86400000 recordedAt,
   json_extract(reply_json,'$.reply.ok') ok,json_extract(reply_json,'$.reply.data.sessionId') targetSessionId,json_extract(reply_json,'$.reply.data.branchId') targetBranchId
   FROM request_receipts WHERE owner_session_id=? AND command IN('sessions.fork','sessions.copy') AND expires_at-86400000>? ORDER BY rowid`,
    sourceId,
    baseline.startedAfter,
  );
  const globalCounts = {
    runs: one('SELECT count(*) n FROM runs').n,
    attempts: one('SELECT count(*) n FROM provider_attempts').n,
    tools: one('SELECT count(*) n FROM tool_calls').n,
    ledger: one('SELECT count(*) n FROM usage_ledger').n,
  };
  const selected = messages.find((m) => m.id === baseline.sourceMessageId);
  const failedAttempts = all(
    `SELECT m.id,m.parent_message_id parentId,m.status,m.provider_attempt_id attemptId,
   json_extract(m.chat_json,'$.errorCode') errorCode,json_extract(m.chat_json,'$.diagnosticCode') diagnosticCode,
   coalesce(length(json_extract(m.content_json,'$.blocks[0].text')),0) generatedTextLength,
   a.status attemptStatus,a.error_code attemptError,u.source,u.charged_tokens chargedTokens
   FROM messages m JOIN provider_attempts a ON a.id=m.provider_attempt_id JOIN usage_ledger u ON u.provider_attempt_id=a.id
   WHERE m.session_id=? AND m.branch_id=? AND m.run_id=? AND m.status='interrupted' ORDER BY m.created_at,m.id`,
    sourceId,
    baseline.sourceBranchId,
    selected?.runId,
  );
  const failureExplanation = failedAttempts.map((f) => ({
    ...f,
    samePromptParentAsSelected: f.parentId === selected?.parentId,
    isAncestorOfSelected: baseline.sourcePath.some((m) => m.id === f.id),
    presentInCopy: copiedMessages.some((m) => m.sourceMessageId === f.id),
    preservedInOriginal: oldMessages.some((m) => m.id === f.id && m.preserved),
  }));
  const checks = {
    oneForkReceiptAndNewSession:
      receipts.length === 1 &&
      receipts[0].command === 'sessions.fork' &&
      receipts[0].ok === 1 &&
      receipts[0].state === 'completed' &&
      copy?.id === receipts[0].targetSessionId &&
      copy?.branchId === receipts[0].targetBranchId,
    copySessionMetadata:
      copy?.mode === source.mode &&
      copy?.projectId === source.projectId &&
      copy?.titleManual === 1 &&
      copy?.titleMatchesCopy === 1 &&
      copy?.noteMatches === 1 &&
      copy?.tagsMatch === 1,
    independentMainBranch:
      copiedBranches.length === 1 &&
      copiedBranches[0].parentId === null &&
      copiedBranches[0].forkMessageId === baseline.sourceMessageId &&
      copiedBranches[0].headMessageId === copiedMessages.at(-1)?.id &&
      copiedBranches[0].id === copy?.branchId,
    exactSelectedAncestryCopied:
      copiedMessages.length === baseline.sourcePath.length &&
      mapping.every((m) => m.matches) &&
      mapping.length === 2,
    onlyExpectedSuccessfulPromptAndAnswer:
      copiedMessages.map((m) => m.role).join(',') === 'user,assistant' &&
      copiedMessages.every((m) => m.status === 'final' && m.errorCode === null),
    originalSessionPreserved: Object.keys(baseline.sourceSession).every(
      (key) => source?.[key] === baseline.sourceSession[key],
    ),
    originalMessagesAndBranchesPreserved:
      oldMessages.every((m) => m.preserved) &&
      oldBranches.every((b) => b.preserved) &&
      messages.length === baseline.messages.length,
    originalLedgerPreserved: hash(JSON.stringify(oldLedger)) === baseline.oldLedgerSHA256,
    failureIsPreservedSiblingOutsideCopyPath:
      failureExplanation.length === 1 &&
      failureExplanation.every(
        (f) =>
          f.errorCode === 'NETWORK_ERROR' &&
          f.diagnosticCode === 'response_headers_timeout' &&
          f.generatedTextLength === 0 &&
          f.attemptStatus === 'failed' &&
          f.source === 'estimated' &&
          f.samePromptParentAsSelected &&
          !f.isAncestorOfSelected &&
          !f.presentInCopy &&
          f.preservedInOriginal,
      ),
    noNewExecutionOrSettlement: Object.keys(globalCounts).every(
      (key) => globalCounts[key] === baseline.globalCounts[key],
    ),
    noNewTraceAttempts: trace.attempts.every((t) =>
      baseline.oldLedger.some((a) => a.attemptId === t.attemptId),
    ),
    idleNoUnsettledOrDuplicates:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
  };
  const report = {
    task: 'P02-03',
    round: 'C-fork-session',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_selected_message_fork'
      : 'observed_requires_review',
    checks,
    source,
    copy,
    sourceBranches: branches,
    copiedBranches,
    copiedMessages,
    mapping,
    oldMessages,
    oldBranches,
    failureExplanation,
    globalCounts,
    receipts,
    finding:
      'Fork copies the selected successful reply and its parent chain. The timeout card is a distinct failed retry attempt sharing the same user parent, with zero generated text; it is not an ancestor of the selected final reply. It and its estimate remain in the original conversation/ledger. This is not a status filter: selecting an interrupted reply itself would include that selected path.',
    humanObservation:
      'User sees successful reply plus timeout card in original, and only the successful reply in the newly forked copy; asked whether that difference is expected.',
    limits:
      'Bounded fork from this successful reply only. No full-session backup, arbitrary attempt-tree copy, all message types, attachments, other providers or global task/stage pass claimed.',
    baseline: 'fork-baseline-2026-10-17.json',
    sourceSnapshot: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  db.exec('COMMIT');
  const reportName = 'fork-review-' + Date.now() + '.json';
  writeFileSync(join(dir, reportName), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      reportPath: join(dir, reportName),
      status: report.status,
      checks,
      copy,
      mapping,
      failureExplanation,
      globalCounts,
    }),
  );
} finally {
  db.close();
}
