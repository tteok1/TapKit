import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const snapshot = read('snapshot-1792223637727.json');
const trace = read('tool-trace-review-1792223637212.json');
const attempt = snapshot.newAttempts.find((row) => row.id === trace.attempts[0].attemptId);
const run = snapshot.newRuns.find((row) => row.id === attempt.runId);
if (!run || run.tools || attempt.status !== 'completed' || trace.attempts.length !== 1)
  throw Error('Unexpected C3 correlation');
const observation = {
  task: 'P02-02',
  round: 'C3',
  localDate: '2026-10-17',
  status: 'not_accepted_no_standard_upstream_tool_proposal',
  userReply: '未执行工具',
  caseId: trace.caseId,
  traceReview: 'tool-trace-review-1792223637212.json',
  snapshot: 'snapshot-1792223637727.json',
  run,
  attempt,
  protocol: trace.attempts[0],
  applicationToolRows: snapshot.newTools.filter((row) => row.runId === run.id).length,
  workload: snapshot.workload,
  priorLedgerUnchanged: snapshot.priorLedgerUnchanged,
  duplicateSettlements: snapshot.duplicateSettlements,
  finding:
    'Serialized request supplied both canonical dotted names. HTTP200 parsed SSE had only text/stop and zero tool fields or delivered calls. No hidden executed call or discarded standard tool_calls evidenced.',
  contractDefect:
    'Official FunctionObject.name pattern excludes dots; local request used files.read/history.search. ADR0053 fixes the verified contract violation; it is not yet proven to be the sole cause of the upstream no-call choice.',
  next: 'Use locally verified alias repair for one bounded user-operated attempt; no further unchanged-prompt retries on the old build. A/B unchanged, other live channels deferred, task/gate unchanged.',
  agentModelRequests: 0,
  keyOrNativeBodiesRead: 0,
  messageBodiesRead: 0,
};
writeFileSync(
  join(dir, 'round-c3-observation-2026-10-17.json'),
  JSON.stringify(observation, null, 2) + '\n',
);
const start = read('round-c3-start-2026-10-17.json');
start.status = observation.status;
start.observation = 'round-c3-observation-2026-10-17.json';
writeFileSync(join(dir, 'round-c3-start-2026-10-17.json'), JSON.stringify(start, null, 2) + '\n');
console.log(
  JSON.stringify({
    runId: run.id,
    attemptId: attempt.id,
    actualTokens: attempt.chargedTokens,
    toolRows: observation.applicationToolRows,
  }),
);
