import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const support = join(root, 'docs/evidence/P02-02/live-2026-10-15');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const planned = read(join(dir, 'edit-retest-baseline-2026-10-17.json'));
const before = read(join(root, planned.baselineSnapshot));
const afterName =
  process.argv.find((arg) => /^snapshot-\d+\.json$/.test(arg)) ?? 'snapshot-1792239373074.json';
const traceName =
  process.argv.find((arg) => /^tool-trace-review-\d+\.json$/.test(arg)) ??
  'tool-trace-review-1792239372992.json';
const after = read(join(support, afterName));
const trace = read(join(support, traceName));
const c5 = read(join(support, 'round-c5-start-2026-10-17.json'));
const c5Review = read(join(support, 'round-c5-review-2026-10-17.json'));
const newRuns = after.newRuns.filter((r) => r.createdAt > planned.startedAfter);
if (
  newRuns.length !== 1 ||
  newRuns[0].sessionId !== c5.newSessionId ||
  trace.caseId !== planned.caseId ||
  before.dataDir !== planned.dataDir ||
  after.dataDir !== planned.dataDir
)
  throw Error('Unexpected actual-session binding');
const sessionId = c5.newSessionId;
const originalReview = c5Review.reviews.find((r) => r.run.sessionId === sessionId);
const db = new DatabaseSync(join(planned.dataDir, 'db/app.sqlite'), { readOnly: true });
const hash = (s) => createHash('sha256').update(s).digest('hex');
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const session = one(
    'SELECT id,active_branch_id branchId,revision FROM sessions WHERE id=? AND deleted_at IS NULL',
    sessionId,
  );
  const branches = all(
    'SELECT id,parent_branch_id parentId,fork_message_id forkMessageId,head_message_id headMessageId,revision FROM branches WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,id',
    sessionId,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,length(content_json) contentJsonLength,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    sessionId,
  );
  const run = one(
    `SELECT r.id,r.status,r.calls,r.tools,r.user_message_id userMessageId,r.assistant_message_id assistantMessageId,r.root_run_id rootRunId,u.branch_id branchId,u.parent_message_id parentId,
    json_extract(u.content_json,'$.blocks[0].text')=? inputMatchesExpected,
    trim(json_extract(a.content_json,'$.blocks[0].text'))='编辑分支成功' replyMatchesExpected,
    trim(json_extract(a.content_json,'$.blocks[0].text'))='未执行工具' replyIsOldNoToolPhrase
    FROM runs r JOIN messages u ON u.id=r.user_message_id JOIN messages a ON a.id=r.assistant_message_id WHERE r.id=?`,
    planned.prompt,
    newRuns[0].id,
  );
  const main = branches.find((b) => b.parentId === null);
  const edit = branches.find((b) => b.id === run.branchId);
  const oldMetadata = before.newMessages.filter((m) => m.sessionId === sessionId);
  const oldMessages = oldMetadata.map((old) => ({
    id: old.id,
    metadataPreserved: messages.some(
      (m) =>
        m.id === old.id &&
        ['role', 'status', 'runId', 'contentJsonLength'].every((k) => m[k] === old[k]),
    ),
  }));
  const oldUser = messages.find((m) => m.role === 'user' && m.branchId === main?.id);
  const originalSemantics = one(
    `SELECT
    (SELECT json_extract(content_json,'$.blocks[0].text')=? FROM messages WHERE id=?) promptMatchesPriorPreparation,
    (SELECT trim(json_extract(content_json,'$.blocks[0].text'))=? FROM messages WHERE id=?) originalAnswerMatchesRecordedToolResult`,
    c5.prompt,
    oldUser?.id,
    originalReview.result.firstResultMessageId,
    originalReview.answer.answerId,
  );
  const contexts = all(
    `SELECT c.id,c.prompt_version promptVersion,c.logical_call_id logicalCallId,
    (SELECT count(*) FROM json_each(c.ordered_refs_json) x WHERE json_extract(x.value,'$.id')=r.user_message_id) currentUserRefCount FROM context_snapshots c JOIN runs r ON r.id=c.run_id WHERE c.run_id=?`,
    run.id,
  );
  const attempts = all(
    `SELECT a.id attemptId,a.status,a.error_code errorCode,a.root_run_id rootRunId,a.attempt_no attemptNo,a.provider_account_id accountId,a.model_ref modelRef,u.source,u.input_tokens inputTokens,u.output_tokens outputTokens,u.charged_tokens chargedTokens,
    (SELECT count(*) FROM usage_ledger x WHERE x.provider_attempt_id=a.id) settlementCount
    FROM provider_attempts a LEFT JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id=? ORDER BY a.created_at,a.id`,
    run.id,
  );
  const oldAttempts = before.newAttempts
    .filter((a) => a.runId === originalReview.run.id)
    .map((old) => {
      const current = one(
        `SELECT a.id,a.run_id runId,a.root_run_id rootRunId,a.logical_call_id logicalCallId,a.attempt_no attemptNo,a.status,a.error_code errorCode,a.model_ref modelRef,a.created_at createdAt,u.source,u.input_tokens inputTokens,u.output_tokens outputTokens,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.id=?`,
        old.id,
      );
      return {
        attemptId: old.id,
        preserved: !!current && Object.keys(old).every((key) => current[key] === old[key]),
      };
    });
  const receipts = all(
    `SELECT rowid sequence,request_id requestId,command,state,expires_at-86400000 recordedAt,
    json_extract(reply_json,'$.reply.ok') ok,json_extract(reply_json,'$.reply.data.branchId') branchId,json_extract(reply_json,'$.reply.data.runId') runId
    FROM request_receipts WHERE owner_session_id=? AND expires_at-86400000>? AND command IN('messages.edit','messages.regenerate','messages.switchBranch') ORDER BY rowid`,
    sessionId,
    planned.startedAfter,
  );
  const editReceipt = receipts.filter((r) => r.command === 'messages.edit');
  const switches = receipts.filter(
    (r) =>
      r.command === 'messages.switchBranch' && r.sequence > (editReceipt[0]?.sequence ?? Infinity),
  );
  const mainSwitch = switches.findIndex((r) => r.branchId === main?.id);
  const checks = {
    usedActualC5SessionNotPlannedFailedSession: sessionId !== planned.session.id,
    oneNewEditBranchWithOriginalUserFork:
      branches.length === 2 && edit?.parentId === main?.id && edit?.forkMessageId === oldUser?.id,
    oneNewPromptAndAnswer:
      messages.length === oldMetadata.length + 2 &&
      run.parentId === null &&
      run.inputMatchesExpected === 1 &&
      run.replyMatchesExpected === 1 &&
      run.replyIsOldNoToolPhrase === 0,
    originalMainMetadataAndRecordedSemanticsPreserved:
      oldMetadata.length === 5 &&
      oldMessages.every((m) => m.metadataPreserved) &&
      originalSemantics.promptMatchesPriorPreparation === 1 &&
      originalSemantics.originalAnswerMatchesRecordedToolResult === 1 &&
      main?.headMessageId === originalReview.answer.answerId,
    originalFourLedgerEntriesPreserved:
      oldAttempts.length === 4 && oldAttempts.every((a) => a.preserved),
    repairedContextVersionAndUserRef:
      contexts.length >= 1 &&
      contexts.every(
        (c) => c.promptVersion === planned.expectedPromptVersion && c.currentUserRefCount === 1,
      ) &&
      new Set(contexts.map((c) => c.logicalCallId)).size === 1,
    oneCompletedRunWithToolsZero:
      run.status === 'completed' && run.calls === 1 && run.tools === 0 && run.rootRunId === run.id,
    oneActualSettlement:
      attempts.length === 1 &&
      attempts[0].status === 'completed' &&
      attempts[0].errorCode === null &&
      attempts[0].attemptNo === 1 &&
      attempts[0].source === 'actual' &&
      attempts[0].settlementCount === 1 &&
      attempts[0].rootRunId === run.id,
    editReceiptMatches:
      editReceipt.length === 1 &&
      editReceipt[0].state === 'completed' &&
      editReceipt[0].runId === run.id &&
      editReceipt[0].branchId === run.branchId,
    switchedMainThenEditedBranch:
      mainSwitch >= 0 &&
      switches.slice(mainSwitch + 1).some((r) => r.branchId === run.branchId) &&
      session.branchId === run.branchId,
    noAdditionalReplayOrTool:
      after.newAttempts.filter((a) => a.createdAt > planned.startedAfter).length === 1 &&
      after.newTools.filter((a) => a.createdAt > planned.startedAfter).length === 0 &&
      receipts.every((r) => r.command !== 'messages.regenerate'),
    traceSuccessfulTextOnly:
      trace.opened &&
      trace.attempts.length === 1 &&
      trace.attempts[0].attemptId === attempts[0]?.attemptId &&
      trace.attempts[0].response.httpStatus === 200 &&
      trace.attempts[0].response.outcome === 'finished' &&
      trace.attempts[0].response.finishReasons.includes('stop') &&
      trace.attempts[0].response.deliveredToolEnds === 0,
    idleAndNoUnsettledOrDuplicates:
      Object.values(after.workload).every((v) => v === 0) &&
      after.duplicateSettlements.length === 0,
  };
  const report = {
    task: 'P02-03',
    round: 'A-actual-C5-session-edit',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_edit_and_branch_switch_actual_session'
      : 'observed_requires_review',
    caseId: planned.caseId,
    session,
    branches,
    run,
    contexts,
    attempts,
    receipts,
    checks,
    oldMessages,
    oldAttempts,
    originalSemantics,
    newActualTokens: attempts
      .filter((a) => a.source === 'actual')
      .reduce((n, a) => n + a.chargedTokens, 0),
    plannedSessionId: planned.session.id,
    plannedSessionOutcome:
      'No new edit/run there; all six message hashes and both branches preserved in edit-retest-review-1792239439169.json. The original failed-session answer retest remains not_performed.',
    preservationLimit:
      'Actual C5 main has earlier IDs/roles/status/length and prepared input/recorded final-result comparisons, plus user visual confirmation; no pre-edit full-body SHA was captured for this alternate session. Do not claim byte-for-byte pre/post body hashing for it. Current hashes are only a baseline for the next check.',
    causalLimit:
      'Successful edit in another existing conversation corroborates current bounded behavior; it does not prove the original failed conversation is now fixed or a sole cause of earlier no-tool choices.',
    humanObservation: 'User reports the requested test results appear as expected.',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + afterName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    baselineSnapshot: planned.baselineSnapshot,
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  const reportName = 'edit-actual-session-review-' + Date.now() + '.json';
  if (process.argv.includes('--prepare-regenerate')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Actual edit not ready for next check');
    const ledger = all(
      'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
      sessionId,
    );
    const next = {
      task: 'P02-03',
      round: 'B-regenerate',
      status: 'prepared_waiting_one_user_regenerate',
      checkedAt: new Date().toISOString(),
      startedAfter: after.capturedAt,
      dataDir: planned.dataDir,
      caseId: planned.caseId,
      session,
      branches,
      messages,
      oldLedger: ledger,
      oldLedgerSHA256: hash(JSON.stringify(ledger)),
      targetAssistantMessageId: run.assistantMessageId,
      targetUserMessageId: run.userMessageId,
      targetBranchId: run.branchId,
      prompt: planned.prompt,
      expectedReply: '编辑分支成功',
      expectedPromptVersion: planned.expectedPromptVersion,
      priorAcceptance: reportName,
      instructions:
        'Stay on the successful edited branch whose question starts P02E-1017R. Click 重新生成 under its completed 编辑分支成功 assistant answer exactly once. Wait, then switch top branch dropdown between the previous edit branch and the new 回答版本. Both versions must remain; content may be identical for this literal prompt. Do not use other-model regenerate or send/edit again. Stop on error.',
      acceptance:
        'One new candidate branch linked to target assistant and one new run/actual settlement, original branch/message hashes and old ledger preserved; current prompt retained, tools0 expected. Switching does not create further work.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'regenerate-baseline-2026-10-17.json'),
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
      branches,
      run,
      attempts,
      receipts,
      newActualTokens: report.newActualTokens,
    }),
  );
} finally {
  db.close();
}
