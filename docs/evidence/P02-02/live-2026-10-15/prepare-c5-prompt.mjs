import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const preflight = read('clean-control-preflight-1792233054679.json');
const baseline = read('snapshot-1792233054773.json');
const trace = read('tool-trace-review-1792233055005.json');
if (
  preflight.status !== 'blank_chat_ready_no_model_request' ||
  !baseline.accountReady ||
  baseline.preferences.revision !== 4 ||
  Object.values(baseline.workload).some(Boolean)
)
  throw Error('C5 not ready');
const original = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
if (original.root !== root || realpathSync(original.dataDir) !== realpathSync(baseline.dataDir))
  throw Error('Wrong profile');
const sessionId = preflight.sessions[0].id;
const marker = preflight.marker;
const prompt = `Retrieve this utterance's identifier through the supplied readonly lookup function. Locate the exact literal ${marker} solely within conversation ${sessionId}, requesting one match. After receiving the function result, output the first identifier. Perform exactly one lookup.`;
const keys = [...new Set(prompt.toLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [])].slice(0, 100);
const db = new DatabaseSync(join(original.dataDir, 'db/app.sqlite'), { readOnly: true });
try {
  db.exec('BEGIN');
  const latest = db
    .prepare(
      `SELECT s.mode,s.project_id projectId,s.context_seed_json IS NULL noContextSeed,
    (SELECT count(*) FROM messages m WHERE m.session_id=s.id AND m.deleted_at IS NULL) messages FROM sessions s WHERE id=? AND deleted_at IS NULL`,
    )
    .get(sessionId);
  if (
    !latest ||
    latest.messages ||
    latest.mode !== 'chat' ||
    latest.projectId !== null ||
    !latest.noContextSeed
  )
    throw Error('New chat changed');
  // Same keyword extraction as MemoryService.background; zero hits over ALL old
  // messages is stronger than its active/authorized/exclude-current subset.
  const matches = keys.map((key) => ({
    key,
    matches: db
      .prepare(
        'SELECT count(*) n FROM messages WHERE session_id<>? AND instr(lower(content_json),?)>0',
      )
      .get(sessionId, key).n,
  }));
  const activeMemories = db
    .prepare("SELECT count(*) n FROM memories WHERE status='active' AND deleted_at IS NULL")
    .get().n;
  const settings = db
    .prepare(
      "SELECT coalesce(json_extract(value_json,'$.values.historyEnabled'),1) historyEnabled,length(coalesce(json_extract(value_json,'$.values.personalization.instructions'),'')) instructionLength FROM settings WHERE key='preferences' AND scope_type='profile' AND deleted_at IS NULL",
    )
    .get();
  db.exec('COMMIT');
  const safe =
    matches.every((m) => m.matches === 0) &&
    activeMemories === 0 &&
    settings.historyEnabled &&
    !settings.instructionLength;
  const report = {
    task: 'P02-02',
    round: 'C5',
    checkedAt: new Date().toISOString(),
    status: safe ? 'prompt_ready_one_user_send' : 'background_overlap_requires_review',
    sessionId,
    prompt,
    latest,
    matches,
    activeMemories,
    settings,
    limitation:
      'Fresh conversation plus distinct synthetic query/English phrasing is a bounded context-isolation control, not a single-variable proof of the original cause. Global automatic background stays enabled; zero keyword matches prevents old-message inclusion for this prompt at this baseline.',
    messageBodiesExported: false,
    databaseWrites: 0,
    agentModelRequests: 0,
  };
  const output = 'c5-prompt-preflight-' + Date.now() + '.json';
  writeFileSync(join(dir, output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath: output, ...report }));
  if (!safe) process.exitCode = 1;
  else {
    const start = read('round-c5-start-2026-10-17.json');
    Object.assign(start, {
      status: 'waiting_user_one_clean_context_attempt',
      newSessionId: sessionId,
      prompt,
      preflight: 'clean-control-preflight-1792233054679.json',
      promptPreflight: output,
      baseline: 'snapshot-1792233054773.json',
      startedAfter: baseline.capturedAt,
      latestTraceReview: 'tool-trace-review-1792233055005.json',
      priorTraceAttemptIds: trace.attempts.map((a) => a.attemptId),
      requestBudget:
        'One user send; existing production root/time/usage limits and retry policy unchanged. Automatic title, if triggered, is separately correlated rather than counted as a duplicate foreground call.',
      userInstruction:
        'Paste this prepared prompt once into the verified new regular chat. Report reply and read-only tool count; stop after response or error. No recheck/reconfiguration/restart or repeats of A/B.',
      expectedResult:
        'One history.search tool call with limit1 and sessionIds containing only the new session; exact marker result should reference this newly sent message. Then paired result and final answer; no pass from prose alone.',
      controlLimitations: report.limitation,
    });
    writeFileSync(
      join(dir, 'round-c5-start-2026-10-17.json'),
      JSON.stringify(start, null, 2) + '\n',
    );
  }
} finally {
  db.close();
}
