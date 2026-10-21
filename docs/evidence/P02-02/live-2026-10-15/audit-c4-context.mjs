import { DatabaseSync } from 'node:sqlite';
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
  throw Error('Unexpected profile');
const db = new DatabaseSync(join(original.dataDir, 'db/app.sqlite'), { readOnly: true });
const sessionId = '01a1442b-3b71-78b6-b3a3-f47c8df370cf';
const start = 1792224143778;
const nonce = 'P02C5-5e1a8917-40c8-4e13-9343-94663d7bf074';
try {
  db.exec('BEGIN');
  const audit = db
    .prepare(
      `SELECT r.id runId,r.user_message_id userMessageId,
    m.role userRole,m.status userStatus,length(m.content_json) userContentLength,
    instr(m.content_json,'history_search')>0 currentInputNamesWireTool,
    instr(m.content_json,'补充已生效')>0 currentInputContainsTestQuery,
    (SELECT count(*) FROM context_snapshots c WHERE c.run_id=r.id) contextSnapshots,
    (SELECT count(*) FROM context_snapshots c WHERE c.run_id=r.id AND EXISTS
      (SELECT 1 FROM json_each(c.ordered_refs_json) x WHERE json_extract(x.value,'$.id')=r.user_message_id)) snapshotsIncludingCurrentUser,
    (SELECT count(*) FROM messages p WHERE p.session_id=r.session_id AND p.role='assistant' AND p.created_at<m.created_at) priorAssistantMessages
    FROM runs r JOIN messages m ON m.id=r.user_message_id WHERE r.session_id=? AND r.created_at>? ORDER BY r.created_at`,
    )
    .all(sessionId, start);
  const personal = db
    .prepare(
      `SELECT key,
    coalesce(json_extract(value_json,'$.values.personalization.enabled'),0) personalizationEnabled,
    length(coalesce(json_extract(value_json,'$.values.personalization.instructions'),'')) personalInstructionLength
    FROM settings WHERE scope_type='profile' AND deleted_at IS NULL`,
    )
    .all();
  const marker = db
    .prepare('SELECT count(*) n FROM messages WHERE instr(content_json,?)>0')
    .get(nonce);
  const report = {
    task: 'P02-02',
    localDate: '2026-10-17',
    checkedAt: new Date().toISOString(),
    readOnlyDatabase: true,
    audit,
    settingsMetadata: personal,
    cleanControlMarker: { value: nonce, existingMessageMatches: marker.n },
    interpretation:
      'Context source references include the current user message. This is not an archived raw serialized request; do not overclaim verbatim outgoing content. Local full-stack fixture checks exact latest user content after repeated prior refusals.',
    messageBodiesExported: false,
    credentialsOrNativeRead: 0,
    modelRequests: 0,
  };
  db.exec('COMMIT');
  const output = 'context-audit-' + Date.now() + '.json';
  writeFileSync(join(dir, output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath: output, ...report }));
} finally {
  db.close();
}
