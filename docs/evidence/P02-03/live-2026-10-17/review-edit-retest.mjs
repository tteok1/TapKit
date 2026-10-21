import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read(join(dir, 'edit-retest-baseline-2026-10-17.json'));
const original = read(
  join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
);
if (original.root !== root || realpathSync(original.dataDir) !== realpathSync(baseline.dataDir))
  throw Error('Unexpected profile binding');
const snapshotPath = process.argv[2];
const tracePath = process.argv[3];
if (
  !/^docs\/evidence\/P02-02\/live-2026-10-15\/snapshot-\d+\.json$/.test(snapshotPath ?? '') ||
  !/^docs\/evidence\/P02-02\/live-2026-10-15\/tool-trace-review-\d+\.json$/.test(tracePath ?? '')
)
  throw Error('Expected bounded metadata report paths');
const snapshot = read(join(root, snapshotPath));
const trace = read(join(root, tracePath));
if (
  snapshot.dataDir !== baseline.dataDir ||
  trace.caseId !== baseline.caseId ||
  snapshot.capturedAt <= baseline.startedAfter
)
  throw Error('Unexpected snapshot or trace binding');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const sessionId = baseline.session.id;
  const session = one(
    'SELECT id,active_branch_id branchId,revision FROM sessions WHERE id=? AND deleted_at IS NULL',
    sessionId,
  );
  const branches = all(
    'SELECT id,parent_branch_id parentId,head_message_id headMessageId,revision FROM branches WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,id',
    sessionId,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    sessionId,
  );
  const runs = all(
    `SELECT r.id,r.status,r.calls,r.tools,r.root_run_id rootRunId,r.task_version taskVersion,r.created_at createdAt,r.started_at startedAt,r.ended_at endedAt,r.user_message_id userMessageId,r.assistant_message_id assistantMessageId,
    u.branch_id branchId,u.parent_message_id userParentId,json_extract(u.content_json,'$.blocks[0].text')=? inputMatchesExpected,
    (SELECT trim(json_extract(a.content_json,'$.blocks[0].text'))='编辑分支成功' FROM messages a WHERE a.run_id=r.id AND a.role='assistant' ORDER BY a.rowid DESC LIMIT 1) replyMatchesExpected,
    (SELECT trim(json_extract(a.content_json,'$.blocks[0].text'))='未执行工具' FROM messages a WHERE a.run_id=r.id AND a.role='assistant' ORDER BY a.rowid DESC LIMIT 1) replyIsOldNoToolPhrase
    FROM runs r JOIN messages u ON u.id=r.user_message_id WHERE r.session_id=? AND r.created_at>? ORDER BY r.created_at,r.id`,
    baseline.prompt,
    sessionId,
    baseline.startedAfter,
  );
  const contexts = all(
    `SELECT c.id,c.run_id runId,c.logical_call_id logicalCallId,c.prompt_version promptVersion,
    (SELECT count(*) FROM json_each(c.ordered_refs_json) x WHERE json_extract(x.value,'$.id')=r.user_message_id) currentUserRefCount
    FROM context_snapshots c JOIN runs r ON r.id=c.run_id WHERE r.session_id=? AND r.created_at>? ORDER BY c.created_at,c.id`,
    sessionId,
    baseline.startedAfter,
  );
  const attempts = all(
    `SELECT a.id attemptId,a.run_id runId,a.root_run_id rootRunId,a.logical_call_id logicalCallId,a.attempt_no attemptNo,a.status,a.error_code errorCode,a.provider_account_id accountId,a.model_ref modelRef,a.is_active_answer activeAnswer,
    (SELECT count(*) FROM usage_ledger x WHERE x.provider_attempt_id=a.id) settlementCount,u.source,u.input_tokens inputTokens,u.output_tokens outputTokens,u.charged_tokens chargedTokens
    FROM provider_attempts a LEFT JOIN usage_ledger u ON u.provider_attempt_id=a.id
    WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=? AND created_at>?) ORDER BY a.created_at,a.id`,
    sessionId,
    baseline.startedAfter,
  );
  const oldMessages = baseline.messages.map((old) => {
    const current = messages.find((m) => m.id === old.id);
    return {
      id: old.id,
      preserved:
        !!current &&
        ['branchId', 'parentId', 'role', 'status', 'runId', 'revision', 'contentSHA256'].every(
          (key) => current[key] === old[key],
        ),
    };
  });
  const oldBranches = baseline.branches.map((old) => {
    const current = branches.find((b) => b.id === old.id);
    return {
      id: old.id,
      preserved:
        !!current &&
        ['parentId', 'headMessageId', 'revision'].every((key) => current[key] === old[key]),
    };
  });
  const ledger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sessionId,
  );
  const oldIds = new Set(baseline.oldLedger.map((a) => a.attemptId));
  const oldLedger = ledger.filter((a) => oldIds.has(a.attemptId));
  const receipts = all(
    `SELECT rowid sequence,request_id requestId,command,state,expires_at-86400000 recordedAt,
    json_extract(reply_json,'$.reply.ok') ok,json_extract(reply_json,'$.reply.data.branchId') branchId,
    json_extract(reply_json,'$.reply.data.runId') runId
    FROM request_receipts WHERE owner_session_id=? AND expires_at-86400000>? AND command IN('messages.edit','messages.regenerate','messages.switchBranch') ORDER BY rowid`,
    sessionId,
    baseline.startedAfter,
  );
  const edit = receipts.filter((r) => r.command === 'messages.edit');
  const switchesAfterEdit =
    edit.length === 1
      ? receipts.filter(
          (r) => r.command === 'messages.switchBranch' && r.sequence > edit[0].sequence,
        )
      : [];
  const mainSwitchIndex = switchesAfterEdit.findIndex(
    (r) => r.branchId === baseline.originalBranchId,
  );
  const liveRun = runs.length === 1 ? runs[0] : null;
  const editedBranch = liveRun ? branches.find((b) => b.id === liveRun.branchId) : null;
  const targetRunIds = new Set(runs.map((r) => r.id));
  const globalNewRuns = snapshot.newRuns.filter((r) => r.createdAt > baseline.startedAfter);
  const globalNewAttempts = snapshot.newAttempts.filter((a) => a.createdAt > baseline.startedAfter);
  const globalNewTools = snapshot.newTools.filter((t) => t.createdAt > baseline.startedAfter);
  const checks = {
    exactlyOneNewBranch:
      branches.length === baseline.branches.length + 1 &&
      !!editedBranch &&
      editedBranch.parentId === baseline.originalBranchId,
    exactlyTwoNewMessages: messages.length === baseline.messages.length + 2,
    oneCompletedPlainAnswerRun:
      !!liveRun &&
      liveRun.status === 'completed' &&
      liveRun.calls === 1 &&
      liveRun.tools === 0 &&
      liveRun.userParentId === null &&
      liveRun.rootRunId === liveRun.id,
    exactPromptAndExpectedReply:
      !!liveRun &&
      liveRun.inputMatchesExpected === 1 &&
      liveRun.replyMatchesExpected === 1 &&
      liveRun.replyIsOldNoToolPhrase === 0,
    repairedContextVersionAndCurrentUserRef:
      contexts.length === 1 &&
      contexts[0].promptVersion === baseline.expectedPromptVersion &&
      contexts[0].currentUserRefCount === 1,
    allOldBranchesAndMessagesPreserved:
      oldBranches.every((b) => b.preserved) && oldMessages.every((m) => m.preserved),
    oldLedgerUnchanged: hash(JSON.stringify(oldLedger)) === baseline.oldLedgerSHA256,
    oneSuccessfulActualSettlement:
      attempts.length === 1 &&
      attempts[0].status === 'completed' &&
      attempts[0].errorCode === null &&
      attempts[0].attemptNo === 1 &&
      attempts[0].source === 'actual' &&
      attempts[0].settlementCount === 1 &&
      attempts[0].rootRunId === liveRun?.id &&
      ledger.length === baseline.oldLedger.length + 1,
    editReceiptMatchesRunAndBranch:
      edit.length === 1 &&
      edit[0].state === 'completed' &&
      edit[0].runId === liveRun?.id &&
      edit[0].branchId === liveRun?.branchId,
    switchedMainThenEditedBranch:
      mainSwitchIndex >= 0 &&
      switchesAfterEdit.slice(mainSwitchIndex + 1).some((r) => r.branchId === liveRun?.branchId) &&
      session?.branchId === liveRun?.branchId,
    noRunAttemptOrToolReplay:
      globalNewRuns.length === 1 &&
      targetRunIds.has(globalNewRuns[0]?.id) &&
      globalNewAttempts.length === 1 &&
      globalNewAttempts[0].id === attempts[0]?.attemptId &&
      globalNewTools.length === 0 &&
      !receipts.some((r) => r.command === 'messages.regenerate'),
    traceMatchesOneSuccessfulTextResponse:
      trace.opened === true &&
      trace.attempts.length === 1 &&
      trace.attempts[0].attemptId === attempts[0]?.attemptId &&
      trace.attempts[0].response.httpStatus === 200 &&
      trace.attempts[0].response.outcome === 'finished' &&
      trace.attempts[0].response.finishReasons.includes('stop') &&
      trace.attempts[0].response.deliveredToolEnds === 0,
    idleAndNoDuplicateSettlement:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
    originalAccountAndPreferences:
      snapshot.accountReady &&
      snapshot.account.id === '01a13377-f964-786b-bb32-bf916b568ddc' &&
      snapshot.account.modelId === 'glm-4.7-flashx' &&
      snapshot.preferences.revision === 4,
  };
  const report = {
    task: 'P02-03',
    round: 'A-edit-retest',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_edit_and_branch_switch'
      : 'observed_requires_review',
    caseId: baseline.caseId,
    session,
    checks,
    branches,
    runs,
    contexts,
    attempts,
    receipts,
    oldMessages,
    oldBranches,
    oldLedgerUnchanged: checks.oldLedgerUnchanged,
    oldActualTokens: oldLedger.reduce((sum, a) => sum + a.chargedTokens, 0),
    newActualTokens: attempts
      .filter((a) => a.source === 'actual')
      .reduce((sum, a) => sum + a.chargedTokens, 0),
    workload: snapshot.workload,
    source: snapshotPath,
    trace: tracePath,
    baseline: 'edit-retest-baseline-2026-10-17.json',
    repair: 'background-priority-fix-2026-10-17.json',
    humanObservation:
      'User reports the requested reply, branch preservation and switching appear as expected; metadata checks independently corroborate the bounded scope.',
    limits:
      'One ordinary Zhipu Chat/FlashX edit and main/edit branch switching only; not blanket model instruction-following, all providers, remaining P02-03 features or full task/stage acceptance. Tools0 is expected here.',
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  db.exec('COMMIT');
  const reportName = 'edit-retest-review-' + Date.now() + '.json';
  writeFileSync(join(dir, reportName), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      reportPath: join(dir, reportName),
      status: report.status,
      checks,
      session,
      runs,
      attempts,
      receipts,
      newActualTokens: report.newActualTokens,
    }),
  );
} finally {
  db.close();
}
