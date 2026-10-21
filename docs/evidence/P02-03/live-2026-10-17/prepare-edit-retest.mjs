import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const initial = JSON.parse(readFileSync(join(dir, 'edit-baseline-2026-10-17.json'), 'utf8'));
const db = new DatabaseSync(join(initial.dataDir, 'db/app.sqlite'), { readOnly: true });
db.function('diagnostic_sha256', (s) => createHash('sha256').update(s).digest('hex'));
try {
  db.exec('BEGIN');
  const session = db
    .prepare(
      'SELECT id,active_branch_id branchId,revision FROM sessions WHERE id=? AND deleted_at IS NULL',
    )
    .get(initial.session.id);
  const branches = db
    .prepare(
      'SELECT id,parent_branch_id parentId,head_message_id headMessageId,revision FROM branches WHERE session_id=? ORDER BY created_at,id',
    )
    .all(initial.session.id);
  const messages = db
    .prepare(
      'SELECT id,branch_id branchId,parent_message_id parentId,role,status,run_id runId,revision,diagnostic_sha256(content_json) contentSHA256 FROM messages WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at,rowid',
    )
    .all(initial.session.id);
  const ledger = db
    .prepare(
      'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=?) ORDER BY a.created_at,a.id',
    )
    .all(initial.session.id);
  const workload = db
    .prepare(
      "SELECT count(*) n FROM runs WHERE status IN('queued','running','waiting_tool','waiting_user','recovering','pausing','paused')",
    )
    .get().n;
  if (!session || branches.length !== 2 || messages.length !== 6 || ledger.length !== 4 || workload)
    throw Error('Retest baseline changed');
  const prepared = {
    task: 'P02-03',
    round: 'A-edit-retest',
    status: 'prepared_waiting_reopen_and_trace_receipt',
    checkedAt: new Date().toISOString(),
    dataDir: initial.dataDir,
    session,
    branches,
    messages,
    oldLedger: ledger,
    oldLedgerSHA256: createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),
    originalBranchId: initial.session.branchId,
    originalUserMessageId: initial.originalUserMessageId,
    prompt: 'P02E-1017R：请只回复“编辑分支成功”。',
    instructions:
      'After repaired app is opened and trace readiness checked, use top branch dropdown to select original 主分支1. Edit its original English user message (not a bottom-composer send) to the new prompt and Save once. Wait; verify expected answer. Then switch main/new edit branches to confirm original preserved and no requests from switches. Do not regenerate or repeat on failure.',
    repair: 'background-priority-fix-2026-10-17.json',
    oldFailure: 'edit-observation-2026-10-17.json',
    acceptance:
      'One new branch/run from the edit; literal current prompt preserved and expected final answer. Old main and failed edit branch, content hashes and old four ledger entries unchanged. Switching branches does not replay any tool/model work. tools0 is expected for this plain-answer prompt.',
    existingAcceptedScope:
      'P02-02 A/B/C retained; other channels/protocols deferred. No task or stage promotion from preparation.',
    agentModelRequests: 0,
    messageBodiesExported: false,
    credentialOrNativeBodiesRead: 0,
    databaseWrites: 0,
  };
  db.exec('COMMIT');
  writeFileSync(
    join(dir, 'edit-retest-baseline-2026-10-17.json'),
    JSON.stringify(prepared, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      status: prepared.status,
      branches: branches.length,
      messages: messages.length,
      priorActual: ledger.reduce((n, a) => n + a.chargedTokens, 0),
      modelRequests: 0,
    }),
  );
} finally {
  db.close();
}
