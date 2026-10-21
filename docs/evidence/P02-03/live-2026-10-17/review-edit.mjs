import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(dir, 'edit-baseline-2026-10-17.json'), 'utf8'));
const db = new DatabaseSync(join(baseline.dataDir, 'db/app.sqlite'), { readOnly: true });
try {
  db.exec('BEGIN');
  const branches = db
    .prepare(
      'SELECT id,parent_branch_id parentId,head_message_id headId,revision FROM branches WHERE session_id=? ORDER BY created_at,id',
    )
    .all(baseline.session.id);
  const runs = db
    .prepare(
      `SELECT r.id,r.session_id sessionId,r.user_message_id userMessageId,r.status,r.calls,r.tools,r.created_at createdAt,r.root_run_id rootRunId,
   u.branch_id branchId,u.parent_message_id userParentId,json_extract(u.content_json,'$.blocks[0].text')=? inputMatchesExpected,
   (SELECT count(*) FROM context_snapshots c WHERE c.run_id=r.id) contextSnapshots,
   (SELECT count(*) FROM context_snapshots c,json_each(c.ordered_refs_json) x WHERE c.run_id=r.id AND json_extract(x.value,'$.id')=r.user_message_id) contextSourceIncludesUser,
   (SELECT trim(json_extract(a.content_json,'$.blocks[0].text'))='未执行工具' FROM messages a WHERE a.run_id=r.id AND a.role='assistant' ORDER BY a.rowid DESC LIMIT 1) replyIsNoToolText,
   (SELECT trim(json_extract(a.content_json,'$.blocks[0].text'))='编辑分支成功' FROM messages a WHERE a.run_id=r.id AND a.role='assistant' ORDER BY a.rowid DESC LIMIT 1) replyMatchesExpected
   FROM runs r JOIN messages u ON u.id=r.user_message_id WHERE r.session_id=? AND r.created_at>? ORDER BY r.created_at`,
    )
    .all(baseline.prompt, baseline.session.id, Date.parse(baseline.checkedAt));
  const uses = db
    .prepare(
      `SELECT u.kind,u.resource_id sourceId,ref.session_id sourceSessionId,ref.role sourceRole,
   instr(coalesce(ref.content_json,''),'未执行工具')>0 includesPreviousNoToolPhrase,
   instr(coalesce(ref.content_json,''),'只回复')>0 includesOnlyReplyInstruction
   FROM memory_uses u JOIN messages a ON a.id=u.message_id LEFT JOIN messages ref ON u.kind='history' AND ref.id=u.resource_id
   WHERE a.run_id IN(SELECT id FROM runs WHERE session_id=? AND created_at>?)`,
    )
    .all(baseline.session.id, Date.parse(baseline.checkedAt));
  const oldLedger = db
    .prepare(
      'SELECT a.id attemptId,a.run_id runId,a.status,a.error_code errorCode,u.source,u.charged_tokens chargedTokens FROM provider_attempts a JOIN usage_ledger u ON u.provider_attempt_id=a.id WHERE a.id IN(?,?,?) ORDER BY a.created_at,a.id',
    )
    .all(...baseline.oldLedger.map((a) => a.attemptId));
  const oldMessages = baseline.messages.map((m) => ({
    id: m.id,
    ...db
      .prepare(
        'SELECT revision=? revisionPreserved,status=? statusPreserved,branch_id=? branchPreserved,parent_message_id IS ? parentPreserved,length(content_json)=? lengthPreserved FROM messages WHERE id=?',
      )
      .get(m.revision, m.status, m.branchId, m.parentId, m.contentLength, m.id),
  }));
  const report = {
    task: 'P02-03',
    round: 'A-edit-branch',
    checkedAt: new Date().toISOString(),
    status: 'observations_requires_review',
    branches,
    runs,
    historyUses: uses,
    oldMessages,
    oldLedgerUnchanged:
      createHash('sha256').update(JSON.stringify(oldLedger)).digest('hex') ===
      baseline.oldLedgerSHA256,
    source: 'snapshot-1792237776793.json',
    trace: 'tool-trace-review-1792237777038.json',
    modelRequests: 0,
    databaseWrites: 0,
    messageBodiesExported: false,
    credentialOrNativeReads: 0,
  };
  db.exec('COMMIT');
  writeFileSync(
    join(dir, 'edit-observation-2026-10-17.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
