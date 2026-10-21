import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const save = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n');
const report = read('round-c5-review-2026-10-17.json');
const start = read('round-c5-start-2026-10-17.json');
const planned = report.reviews.find((r) => r.run.sessionId === start.newSessionId);
const shown = report.reviews.find(
  (r) => r.actualTokens === 2576 && r.answer.answerMatchesScreenshot,
);
const valid = (r) =>
  r &&
  r.run.status === 'completed' &&
  r.run.calls === 2 &&
  r.run.tools === 1 &&
  r.tool.status === 'succeeded' &&
  r.tool.sideEffect === 'none' &&
  [
    'argsHashMatches',
    'queryMatches',
    'limitIsOne',
    'exactRequestedSession',
    'pairedAssistantCalls',
    'pairedSuccessfulResults',
    'resultRefMatches',
  ].every((k) => r.tool[k] === 1) &&
  r.result.resultCount === 1 &&
  r.result.resultTextContainsMarker === 1 &&
  r.result.sourceMessageContainsMarker === 1 &&
  r.result.allResultRefsInRequestedSession === 1 &&
  r.answer.answerMatchesToolFirstId === 1 &&
  r.answer.followsToolResult === 1 &&
  r.deliveredToolEnds === 1 &&
  r.title.status === 'completed' &&
  r.title.owningRunMatches === 1;
if (
  !valid(planned) ||
  !valid(shown) ||
  !report.earlierAttemptsUnchanged ||
  !report.priorLedgerUnchanged ||
  report.duplicateSettlements.length ||
  Object.values(report.workload).some(Boolean)
)
  throw Error('C5 loop acceptance failed');
const acceptance = {
  task: 'P02-02',
  round: 'C',
  localDate: '2026-10-17',
  status: 'passed_live_scoped_readonly_loop',
  acceptedScope:
    'Existing Zhipu ordinary Chat/FlashX: standard wire tool proposal -> canonical history.search -> exact authorized query/limit1/session -> succeeded read gateway side_effect none -> paired result -> subsequent model final answer -> once-only settlement.',
  plannedC5RunId: planned.run.id,
  screenshotRunId: shown.run.id,
  review: 'round-c5-review-2026-10-17.json',
  snapshot: report.snapshot,
  traceReview: report.traceReview,
  screenshot: report.screenshot,
  originalTargetSessionId: start.newSessionId,
  plannedAttemptAccounting: {
    foregroundActual: 1890,
    titleActual: 213,
    actualTotal: 2103,
    networkFailedEstimated: 12358,
    attempts: 4,
    toolExecutions: 1,
  },
  screenshotAttemptAccounting: {
    foregroundActual: 2364,
    titleActual: 212,
    actualTotal: 2576,
    networkFailedEstimated: 0,
    attempts: 3,
    toolExecutions: 1,
  },
  extraObservedRun:
    'Two separate user-message/client IDs in two sessions were observed. Second is supplemental, not an application duplicate or automatic second run; it explicitly queried the original requested session. No further repetition is needed.',
  semanticLimit: {
    strictCurrentUserMessageIdExpectation: 'not_met',
    returnedId: shown.result.firstResultMessageId,
    returnedRole: shown.result.firstResultRole,
    matchesToolResult: true,
    reason:
      'history.search searches finalized user and assistant bodies, newest first. Before lookup, the model assistant proposal text also contained the marker, so top1 was that newer assistant message. The planned assumption that a unique marker would identify the user message was incorrect; no user-only filter was requested or supported.',
    acceptanceBoundary:
      'The original P02-02 C requirement is the real read-only execution loop and first-result answer, which is evidenced. Do not label the stronger current-user-ID semantic expectation as passed, and do not alter the recorded initial expectation.',
  },
  causeLimit:
    'Tool-name wire defect was verified and repaired; C3/C4 no-call observations remain failed. New session/query/English phrasing changed together; runtime history-use rows also exist after the runs, so this is not proof of a single old-context cause or a perfectly empty full runtime background. This demonstrates actual tool capability, not guaranteed auto-selection or universal provider compatibility.',
  reuse: {
    A: 'passed_user_acceptance',
    B: 'passed_frontend_scoped',
    C: 'passed_live_scoped_readonly_loop',
  },
  taskStatus: 'implemented_not_live_verified',
  stageStatus: 'engineering_passed_external_pending',
  deferred:
    'Other providers/protocols/subscription remain deferred; no task-wide/all-provider or phase-gate promotion.',
  agentModelRequests: 0,
  credentialOrNativeReads: 0,
  messageBodiesExported: false,
  manualBusinessDatabaseWrites: 0,
  next: 'Prepare P02-03 first live message-edit/new-branch/old-branch-preservation check on the screenshot session; existing account/model/build, one user edit only.',
};
save('round-c5-acceptance-2026-10-17.json', acceptance);
start.status = 'closed_readonly_loop_scope_passed_current_user_id_semantic_not_met';
start.acceptance =
  'No pass from text alone; require actual proposal, scoped gateway/result, final answer and once-only settlement. Stop on no-call; no further unchanged-context retries.';
start.acceptanceReport = 'round-c5-acceptance-2026-10-17.json';
start.recordedInitialExpectationPreserved = true;
save('round-c5-start-2026-10-17.json', start);
console.log(
  JSON.stringify({
    status: acceptance.status,
    toolExecutions: 1,
    screenshotActualTokens: 2576,
    strictCurrentUserId: 'not_met',
  }),
);
