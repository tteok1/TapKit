import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const support = join(root, 'docs/evidence/P02-02/live-2026-10-15');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const baseline = read(join(dir, 'regenerate-baseline-2026-10-17.json'));
const snapshotName = process.argv.find((a) => /^snapshot-\d+\.json$/.test(a));
const traceName = process.argv.find((a) => /^tool-trace-review-\d+\.json$/.test(a));
if (!snapshotName || !traceName) throw Error('Expected scoped metadata report names');
const snapshot = read(join(support, snapshotName));
const trace = read(join(support, traceName));
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
  throw Error('Unexpected profile/case/time binding');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', hash);
try {
  db.exec('BEGIN');
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const sessionId = baseline.session.id;
  const session = one(
    `SELECT id,mode,project_id projectId,active_branch_id branchId,revision,
    diagnostic_sha256(title) titleSHA256,title_manual titleManual FROM sessions WHERE id=? AND deleted_at IS NULL`,
    sessionId,
  );
  const branches = all(
    'SELECT id,parent_branch_id parentId,fork_message_id forkMessageId,candidate_for_message_id candidateFor,head_message_id headMessageId,revision FROM branches WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,id',
    sessionId,
  );
  const messages = all(
    'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,source_message_id sourceMessageId,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    sessionId,
  );
  const runs = all(
    `SELECT r.id,r.status,r.calls,r.tools,r.root_run_id rootRunId,r.task_version taskVersion,r.user_message_id userMessageId,r.assistant_message_id assistantMessageId,r.created_at createdAt,
    u.branch_id branchId,u.source_message_id sourceMessageId,json_extract(u.content_json,'$.blocks[0].text')=? promptMatchesExpected,
    trim(json_extract(a.content_json,'$.blocks[0].text'))=? replyMatchesExpected
    FROM runs r JOIN messages u ON u.id=r.user_message_id JOIN messages a ON a.id=r.assistant_message_id WHERE r.session_id=? AND r.created_at>? ORDER BY r.created_at,r.id`,
    baseline.prompt,
    baseline.expectedReply,
    sessionId,
    baseline.startedAfter,
  );
  const run = runs.length === 1 ? runs[0] : null;
  const candidate = branches.find((b) => b.id === run?.branchId);
  const oldBranches = baseline.branches.map((old) => ({
    id: old.id,
    preserved: branches.some(
      (b) =>
        b.id === old.id &&
        ['parentId', 'forkMessageId', 'headMessageId', 'revision'].every(
          (key) => b[key] === old[key],
        ),
    ),
  }));
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
  const ledger = all(
    'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    sessionId,
  );
  const oldIds = new Set(baseline.oldLedger.map((a) => a.attemptId));
  const oldLedger = ledger.filter((a) => oldIds.has(a.attemptId));
  const attempts = all(
    `SELECT a.id attemptId,a.run_id runId,a.root_run_id rootRunId,a.logical_call_id logicalCallId,a.attempt_no attemptNo,a.status,a.error_code errorCode,a.provider_account_id accountId,a.model_ref modelRef,
    u.source,u.input_tokens inputTokens,u.output_tokens outputTokens,u.charged_tokens chargedTokens,(SELECT count(*) FROM usage_ledger x WHERE x.provider_attempt_id=a.id) settlementCount
    FROM provider_attempts a LEFT JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=? AND created_at>?) ORDER BY a.created_at,a.id`,
    sessionId,
    baseline.startedAfter,
  );
  const contexts = all(
    `SELECT c.id,c.logical_call_id logicalCallId,c.prompt_version promptVersion,
    (SELECT count(*) FROM json_each(c.ordered_refs_json) x WHERE json_extract(x.value,'$.id')=r.user_message_id) currentUserRefCount
    FROM context_snapshots c JOIN runs r ON r.id=c.run_id WHERE r.session_id=? AND r.created_at>? ORDER BY c.created_at,c.id`,
    sessionId,
    baseline.startedAfter,
  );
  const receipts = all(
    `SELECT rowid sequence,request_id requestId,command,state,expires_at-86400000 recordedAt,
    json_extract(reply_json,'$.reply.ok') ok,json_extract(reply_json,'$.reply.data.branchId') branchId,json_extract(reply_json,'$.reply.data.runId') runId
    FROM request_receipts WHERE owner_session_id=? AND expires_at-86400000>? AND command IN('messages.edit','messages.regenerate','messages.switchBranch','sessions.fork','sessions.copy') ORDER BY rowid`,
    sessionId,
    baseline.startedAfter,
  );
  const regen = receipts.filter((r) => r.command === 'messages.regenerate');
  const switches = receipts.filter(
    (r) => r.command === 'messages.switchBranch' && r.sequence > (regen[0]?.sequence ?? Infinity),
  );
  const oldSwitch = switches.findIndex((r) => r.branchId === baseline.targetBranchId);
  const globalRuns = snapshot.newRuns.filter((r) => r.createdAt > baseline.startedAfter);
  const globalAttempts = snapshot.newAttempts.filter((r) => r.createdAt > baseline.startedAfter);
  const globalTools = snapshot.newTools.filter((r) => r.createdAt > baseline.startedAfter);
  const newTrace = trace.attempts.filter((t) => attempts.some((a) => a.attemptId === t.attemptId));
  const checks = {
    oneCompletedRegenerate:
      run?.status === 'completed' &&
      run.calls === 1 &&
      run.tools === 0 &&
      run.rootRunId === run.id &&
      runs.length === 1,
    exactPromptAndReply: run?.promptMatchesExpected === 1 && run.replyMatchesExpected === 1,
    oneCandidateForPreviousAnswer:
      branches.length === baseline.branches.length + 1 &&
      candidate?.parentId === baseline.targetBranchId &&
      candidate?.forkMessageId === baseline.targetAssistantMessageId &&
      candidate?.candidateFor === baseline.targetAssistantMessageId,
    copiedUserProvenance:
      run?.sourceMessageId === baseline.targetUserMessageId &&
      messages.find((m) => m.id === run?.userMessageId)?.contentSHA256 ===
        baseline.messages.find((m) => m.id === baseline.targetUserMessageId)?.contentSHA256,
    allOldMessagesAndBranchesPreserved:
      oldMessages.every((m) => m.preserved) && oldBranches.every((b) => b.preserved),
    oldLedgerHashPreserved: hash(JSON.stringify(oldLedger)) === baseline.oldLedgerSHA256,
    requestAndRetryAccounting:
      attempts.length > 0 &&
      new Set(attempts.map((a) => a.logicalCallId)).size === 1 &&
      attempts.every(
        (a, i) =>
          a.attemptNo === i + 1 &&
          a.settlementCount === 1 &&
          a.rootRunId === run?.id &&
          a.accountId === snapshot.account.id &&
          a.modelRef === 'glm-4.7-flashx',
      ) &&
      attempts.at(-1)?.status === 'completed' &&
      attempts.at(-1)?.source === 'actual' &&
      attempts
        .slice(0, -1)
        .every(
          (a) =>
            a.status === 'failed' && a.errorCode === 'NETWORK_ERROR' && a.source === 'estimated',
        ),
    contextVersionAndCurrentUser:
      contexts.length > 0 &&
      contexts.every(
        (c) => c.promptVersion === baseline.expectedPromptVersion && c.currentUserRefCount === 1,
      ),
    oneSuccessfulRegenerateReceipt:
      regen.length === 1 &&
      regen[0].ok === 1 &&
      regen[0].runId === run?.id &&
      regen[0].branchId === run?.branchId,
    oldAndNewVersionSwitches:
      oldSwitch >= 0 &&
      switches.slice(oldSwitch + 1).some((r) => r.branchId === run?.branchId) &&
      session?.branchId === run?.branchId,
    noReplayFromSwitching:
      globalRuns.length === 1 &&
      globalRuns[0].id === run?.id &&
      globalAttempts.length === attempts.length &&
      globalAttempts.every((a) => attempts.some((x) => x.attemptId === a.id)) &&
      globalTools.length === 0 &&
      receipts.every((r) => ['messages.regenerate', 'messages.switchBranch'].includes(r.command)),
    completeTraceForEachAttempt:
      newTrace.length === attempts.length &&
      newTrace.every((t) => {
        const a = attempts.find((x) => x.attemptId === t.attemptId);
        return (
          t.response.deliveredToolEnds === 0 &&
          (a.status === 'completed'
            ? t.response.httpStatus === 200 &&
              t.response.outcome === 'finished' &&
              t.response.finishReasons.includes('stop')
            : t.response.outcome === 'error')
        );
      }),
    idleNoUnsettledOrDuplicates:
      Object.values(snapshot.workload).every((n) => n === 0) &&
      snapshot.duplicateSettlements.length === 0,
  };
  const reportName = 'regenerate-review-' + Date.now() + '.json';
  const report = {
    task: 'P02-03',
    round: 'B-regenerate',
    checkedAt: new Date().toISOString(),
    status: Object.values(checks).every(Boolean)
      ? 'passed_live_scoped_regenerate_and_version_switch'
      : 'observed_requires_review',
    caseId: baseline.caseId,
    session,
    checks,
    branches,
    runs,
    attempts,
    contexts,
    receipts,
    oldMessages,
    oldBranches,
    actualTokens: attempts
      .filter((a) => a.source === 'actual')
      .reduce((n, a) => n + a.chargedTokens, 0),
    estimatedTokens: attempts
      .filter((a) => a.source === 'estimated')
      .reduce((n, a) => n + a.chargedTokens, 0),
    humanConfirmation: '符合预期。可以继续下一项验收',
    baseline: 'regenerate-baseline-2026-10-17.json',
    source: 'docs/evidence/P02-02/live-2026-10-15/' + snapshotName,
    trace: 'docs/evidence/P02-02/live-2026-10-15/' + traceName,
    limits:
      'One same-account/model regeneration with bounded existing retry, old/new answer switching. Failed estimated usage is retained and not presented as actual vendor consumption. Other channels/protocols and full task/stage acceptance remain pending.',
    agentModelRequests: 0,
    databaseWrites: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
  };
  if (process.argv.includes('--prepare-fork')) {
    if (!Object.values(checks).every(Boolean)) throw Error('Regenerate checks not complete');
    const sourcePath = [];
    let id = run.assistantMessageId;
    while (id) {
      const m = messages.find((x) => x.id === id);
      if (!m || sourcePath.length >= 1000 || sourcePath.some((x) => x.id === id))
        throw Error('Invalid source path');
      sourcePath.unshift(m);
      id = m.parentId;
    }
    const next = {
      task: 'P02-03',
      round: 'C-fork-session',
      status: 'prepared_waiting_one_user_fork',
      checkedAt: new Date().toISOString(),
      startedAfter: snapshot.capturedAt,
      dataDir: baseline.dataDir,
      caseId: baseline.caseId,
      sourceSession: session,
      sourceBranchId: run.branchId,
      sourceMessageId: run.assistantMessageId,
      sourcePath,
      branches,
      messages,
      oldLedger: ledger,
      oldLedgerSHA256: hash(JSON.stringify(ledger)),
      priorAcceptance: reportName,
      sessionIds: all('SELECT id FROM sessions WHERE deleted_at IS NULL ORDER BY id').map(
        (s) => s.id,
      ),
      globalCounts: {
        runs: one('SELECT count(*) n FROM runs').n,
        attempts: one('SELECT count(*) n FROM provider_attempts').n,
        tools: one('SELECT count(*) n FROM tool_calls').n,
        ledger: one('SELECT count(*) n FROM usage_ledger').n,
      },
      instructions:
        'On current new 回答版本, click 从此消息分叉会话 once under the final 编辑分支成功 assistant answer. The new conversation should open with the question and answer through that point. Use the top 后退 arrow to verify the original, then 前进 to return to the copy. Do not send anything, rename with AI or regenerate. Report preservation and errors.',
      acceptance:
        'One sessions.fork receipt/new session and its copied path with sourceMessageId/hash provenance, original session branches/messages/ledger unchanged; no new model/tool/run/settlement from fork or navigation. Preparation is not acceptance.',
      agentModelRequests: 0,
      databaseWrites: 0,
      credentialOrNativeReads: 0,
      messageBodiesExported: false,
    };
    writeFileSync(
      join(dir, 'fork-baseline-2026-10-17.json'),
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
      runs,
      attempts,
      receipts,
      actualTokens: report.actualTokens,
      estimatedTokens: report.estimatedTokens,
    }),
  );
} finally {
  db.close();
}
