import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));
const start = read('round-c5-start-2026-10-17.json');
const current = read('snapshot-1792235606039.json');
const baseline = read(start.baseline);
const trace = read('tool-trace-review-1792235606272.json');
const original = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
if (original.root !== root || realpathSync(original.dataDir) !== realpathSync(current.dataDir))
  throw Error('Wrong profile');
const db = new DatabaseSync(join(original.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', (s) => createHash('sha256').update(s).digest('hex'));
const runs = current.newRuns.filter((r) => r.createdAt > start.startedAfter);
const screenshotId = '01a1498e-fba9-76ef-a5d7-3fdc67284d94';
try {
  db.exec('BEGIN');
  const reviews = runs.map((run) => {
    const target = start.newSessionId;
    const tool = db
      .prepare(
        `SELECT t.id,t.tool_name name,t.status,t.side_effect sideEffect,
      t.args_hash=diagnostic_sha256(t.args_json) argsHashMatches,
      json_extract(t.args_json,'$.query')=? queryMatches,
      json_extract(t.args_json,'$.limit')=1 limitIsOne,
      json_array_length(t.args_json,'$.sessionIds')=1 AND json_extract(t.args_json,'$.sessionIds[0]')=? exactRequestedSession,
      (SELECT count(*) FROM messages a,json_each(a.chat_json,'$.calls') c WHERE a.run_id=t.run_id AND a.role='assistant' AND a.status='final' AND json_extract(c.value,'$.id')=t.call_id AND json_extract(c.value,'$.name')=t.tool_name) pairedAssistantCalls,
      (SELECT count(*) FROM messages m WHERE m.run_id=t.run_id AND m.role='tool' AND m.status='final' AND json_extract(m.chat_json,'$.callId')=t.call_id AND json_extract(m.chat_json,'$.name')=t.tool_name AND coalesce(json_extract(m.chat_json,'$.isError'),0)=0) pairedSuccessfulResults,
      t.result_ref=t.id resultRefMatches
      FROM tool_calls t WHERE t.run_id=?`,
      )
      .get(start.syntheticMarker, target, run.id);
    const result = db
      .prepare(
        `SELECT m.id toolMessageId,
      json_array_length(json_extract(m.content_json,'$.blocks[0].text'),'$.messageRefs') resultCount,
      ref.id firstResultMessageId,ref.session_id firstResultSessionId,ref.role firstResultRole,
      instr(json_extract(json_extract(m.content_json,'$.blocks[0].text'),'$.messageRefs[0].text'),?)>0 resultTextContainsMarker,
      ref.id=(SELECT user_message_id FROM runs WHERE id=m.run_id) resultIsCurrentUser,
      ref.run_id=m.run_id resultBelongsToSameRun,
      instr(ref.content_json,?)>0 sourceMessageContainsMarker,
      NOT EXISTS(SELECT 1 FROM json_each(json_extract(m.content_json,'$.blocks[0].text'),'$.messageRefs') x WHERE json_extract(x.value,'$.sessionId')<>?) allResultRefsInRequestedSession
      FROM messages m JOIN messages ref ON ref.id=json_extract(json_extract(m.content_json,'$.blocks[0].text'),'$.messageRefs[0].messageId')
      WHERE m.run_id=? AND m.role='tool' AND m.status='final'`,
      )
      .get(start.syntheticMarker, start.syntheticMarker, target, run.id);
    const answer = db
      .prepare(
        `SELECT a.id answerId,a.status,
      trim(json_extract(a.content_json,'$.blocks[0].text'))=? answerMatchesToolFirstId,
      trim(json_extract(a.content_json,'$.blocks[0].text'))=? answerMatchesScreenshot,
      a.created_at>(SELECT created_at FROM messages WHERE id=?) followsToolResult
      FROM messages a WHERE a.run_id=? AND a.role='assistant' AND a.status='final' ORDER BY a.rowid DESC LIMIT 1`,
      )
      .get(result?.firstResultMessageId ?? '', screenshotId, result?.toolMessageId ?? '', run.id);
    const title = db
      .prepare('SELECT status,run_id=? owningRunMatches FROM title_jobs WHERE session_id=?')
      .get(run.id, run.sessionId);
    const attempts = current.newAttempts.filter((a) => a.runId === run.id);
    const traceAttempts = trace.attempts.filter((a) => attempts.some((x) => x.id === a.attemptId));
    const actual = attempts
      .filter((a) => a.source === 'actual')
      .reduce((n, a) => n + a.chargedTokens, 0);
    const estimated = attempts
      .filter((a) => a.source === 'estimated')
      .reduce((n, a) => n + a.chargedTokens, 0);
    const delivered = traceAttempts.reduce((n, a) => n + a.response.deliveredToolEnds, 0);
    const activeBackground = db
      .prepare(
        'SELECT u.kind,count(*) n FROM memory_uses u JOIN messages m ON m.id=u.message_id WHERE m.run_id=? GROUP BY u.kind',
      )
      .all(run.id);
    return {
      run,
      tool,
      result,
      answer,
      title,
      attempts,
      traceAttempts,
      actualTokens: actual,
      estimatedTokens: estimated,
      deliveredToolEnds: delivered,
      recordedBackgroundUses: activeBackground,
    };
  });
  const oldIds = new Set(baseline.newAttempts.map((a) => a.id));
  const earlierAttemptsUnchanged =
    JSON.stringify(baseline.newAttempts) ===
    JSON.stringify(current.newAttempts.filter((a) => oldIds.has(a.id)));
  const report = {
    task: 'P02-02',
    round: 'C5',
    localDate: '2026-10-17',
    checkedAt: new Date().toISOString(),
    status: 'observations_requires_acceptance_review',
    reviews,
    earlierAttemptsUnchanged,
    priorLedgerUnchanged: current.priorLedgerUnchanged,
    duplicateSettlements: current.duplicateSettlements,
    workload: current.workload,
    snapshot: 'snapshot-1792235606039.json',
    traceReview: 'tool-trace-review-1792235606272.json',
    screenshot: 'round-c5-user-2026-10-17.png',
    messageBodiesExported: false,
    credentialOrNativeReads: 0,
    modelRequests: 0,
    databaseWrites: 0,
  };
  db.exec('COMMIT');
  writeFileSync(
    join(dir, 'round-c5-review-2026-10-17.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
