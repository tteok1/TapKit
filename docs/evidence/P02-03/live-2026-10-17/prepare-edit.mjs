import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../../../..');
const original = JSON.parse(
  readFileSync(
    join(root, 'docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json'),
    'utf8',
  ),
);
if (original.root !== root || dirname(realpathSync(original.dataDir)) !== join(root, '.test-data'))
  throw Error('Wrong profile');
const db = new DatabaseSync(join(original.dataDir, 'db/app.sqlite'), { readOnly: true });
const sessionId = '01a1498f-dbb2-7fa8-8829-be6b985c7926';
try {
  db.exec('BEGIN');
  const session = db
    .prepare(
      'SELECT id,mode,project_id projectId,active_branch_id branchId,revision FROM sessions WHERE id=? AND deleted_at IS NULL',
    )
    .get(sessionId);
  const branches = db
    .prepare(
      'SELECT id,parent_branch_id parentId,head_message_id headMessageId,revision FROM branches WHERE session_id=? ORDER BY created_at,id',
    )
    .all(sessionId);
  const messages = db
    .prepare(
      'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,length(content_json) contentLength FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    )
    .all(sessionId);
  const user = messages.find((m) => m.role === 'user');
  const idle = db
    .prepare(
      "SELECT count(*) n FROM runs WHERE status IN('queued','running','waiting_tool','waiting_user','recovering','pausing','paused')",
    )
    .get().n;
  const title = db.prepare('SELECT status FROM title_jobs WHERE session_id=?').get(sessionId);
  if (
    !session ||
    session.mode !== 'chat' ||
    session.projectId !== null ||
    branches.length !== 1 ||
    !user ||
    idle ||
    title.status !== 'completed'
  )
    throw Error('Edit test not ready');
  const ledger = db
    .prepare(
      'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    )
    .all(sessionId);
  const baseline = {
    task: 'P02-03',
    round: 'A-edit-branch',
    status: 'prepared_waiting_one_user_edit',
    checkedAt: new Date().toISOString(),
    sourceCommit: '3178a8ba224a3bc55432f80ea799da848094bd45',
    dataDir: original.dataDir,
    session,
    branches,
    messages,
    originalUserMessageId: user.id,
    oldLedger: ledger,
    oldLedgerSHA256: createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),
    titleStatus: title.status,
    priorAcceptance: 'docs/evidence/P02-02/live-2026-10-15/round-c5-acceptance-2026-10-17.json',
    prompt: 'P02E-1017：请只回复“编辑分支成功”。',
    instructions:
      'In the current screenshot conversation, use Edit on its first English user message and replace with prompt; Save once. Wait until complete, switch top message-branch dropdown to original main branch and verify old English/tool answer preserved; switch back to edit branch and verify new prompt/reply. Do not send as a new bottom-composer message, regenerate, rename with AI, change model or repeat on error.',
    expected:
      'One new branch and one new run caused by edit; original message/branch/old attempts preserved. Switching branches creates no new model/tool run or settlement. New final answer should be 编辑分支成功. Normal existing retries are separately recorded, not guessed duplicate runs.',
    deferred:
      'Regenerate/other models/remaining organization/history acceptance later; other live providers/protocols stay deferred. No P04/P05.',
    modelRequests: 0,
    credentialOrNativeReads: 0,
    messageBodiesExported: false,
    databaseWrites: 0,
  };
  db.exec('COMMIT');
  writeFileSync(
    join(dir, 'edit-baseline-2026-10-17.json'),
    JSON.stringify(baseline, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      status: baseline.status,
      sessionId,
      branches: branches.length,
      messages: messages.length,
      oldActualTokens: ledger.reduce((n, r) => n + r.chargedTokens, 0),
      modelRequests: 0,
    }),
  );
} finally {
  db.close();
}
