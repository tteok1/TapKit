import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const dir = 'docs/evidence/P02-03/selection-result-2026-10-20';
const prep = JSON.parse(readFileSync('docs/evidence/P01-02/zhipu-chat-2026-10-13/app-preparation.json', 'utf8'));
const db = new DatabaseSync(join(prep.dataDir, 'db/app.sqlite'), { readOnly: true });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const sessionId = '01a15472-9232-77bb-9fb2-42fe05500c75';
const runId = '01a15994-be74-7da2-bb5c-7f4cc2047c3a';
const rows = db.prepare('SELECT id,revision,role,status,content_json,chat_json FROM messages WHERE session_id=? ORDER BY id').all(sessionId);
const snapshot = {
  checkedAt: new Date().toISOString(), dataDir: prep.dataDir, sessionId,
  session: db.prepare('SELECT id,revision,active_branch_id FROM sessions WHERE id=?').get(sessionId),
  accounts: db.prepare('SELECT id,revision,status,api_format,model_id FROM provider_accounts ORDER BY id').all(),
  counts: Object.fromEntries(['sessions','messages','provider_accounts','runs','provider_attempts','tool_calls','usage_ledger'].map((table) => [table, db.prepare('SELECT count(*) n FROM ' + table).get().n])),
  messages: rows.map(({content_json,chat_json,...row}) => ({...row, contentSHA256: sha(content_json), metadataSHA256: sha(chat_json)})),
};
if (process.argv.includes('--after')) {
  const before = JSON.parse(readFileSync(join(dir, 'original-profile-before.json'), 'utf8'));
  snapshot.unchanged = ['counts','messages','session','accounts'].every((key) => JSON.stringify(before[key]) === JSON.stringify(snapshot[key]));
  if (!snapshot.unchanged) throw Error('Original profile message or workload counts changed');
  writeFileSync(join(dir, 'original-profile-after.json'), JSON.stringify(snapshot, null, 2) + '\n');
} else {
  writeFileSync(join(dir, 'original-profile-before.json'), JSON.stringify(snapshot, null, 2) + '\n');
  const run = db.prepare('SELECT id,status,status_reason,calls,tools,started_at,ended_at FROM runs WHERE id=?').get(runId);
  const answer = rows.find((row) => row.id === '01a15994-bf4a-723d-ae9d-d400a4d5f0ab');
  const text = JSON.parse(answer.content_json).blocks.map((b) => b.text ?? '').join('\n');
  const refs = JSON.parse(answer.chat_json).attachments;
  writeFileSync(join(dir, 'diagnosis.json'), JSON.stringify({
    checkedAt: snapshot.checkedAt, run, sessionId, answerId: answer.id,
    answerSHA256: sha(text), sourceRef: refs[0],
    startsWithMessageIdAsEvidence: text.startsWith('[[evidence:' + refs[0].messageId + ']]'),
    translationBodyMatches: text.endsWith('琥珀色的灯塔指引着一艘小船安全归家。'),
    contexts: db.prepare('SELECT prompt_version,ordered_refs_json FROM context_snapshots WHERE run_id=?').all(runId),
    diagnosis: 'Pure selection transform retained its source message reference; provider emitted that message ID as a knowledge evidence marker. CitationLedger rejected the marker before run completion. Renderer mapped every VALIDATION_ERROR to a file-picker error.',
    originalDatabaseWrites: 0, agentModelRequests: 0,
  }, null, 2) + '\n');
}
db.close();
console.log(JSON.stringify({counts:snapshot.counts, messages:snapshot.messages.length, unchanged:snapshot.unchanged}));
