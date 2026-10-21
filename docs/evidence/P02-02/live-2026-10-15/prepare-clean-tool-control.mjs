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
try {
  db.exec('BEGIN');
  if (db.prepare('SELECT id FROM profiles').get().id !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10')
    throw Error('Wrong profile');
  const sessions = db
    .prepare(
      `SELECT s.id,s.mode,s.project_id projectId,s.title='新聊天' titleIsNewChat,s.created_at createdAt,
    json_extract(s.settings_json,'$.values.historyEnabled') historyOverride,
    (SELECT count(*) FROM messages m WHERE m.session_id=s.id AND m.deleted_at IS NULL) messages
    FROM sessions s WHERE s.created_at>? AND s.deleted_at IS NULL ORDER BY s.created_at`,
    )
    .all(1792229622816);
  const marker = 'P02C5-5e1a8917-40c8-4e13-9343-94663d7bf074';
  const matches = db
    .prepare('SELECT count(*) n FROM messages WHERE instr(content_json,?)>0')
    .get(marker).n;
  const report = {
    task: 'P02-02',
    round: 'C5',
    checkedAt: new Date().toISOString(),
    status:
      sessions.length === 1 &&
      sessions[0].messages === 0 &&
      sessions[0].mode === 'chat' &&
      sessions[0].projectId === null &&
      matches === 0
        ? 'blank_chat_ready_no_model_request'
        : 'waiting_one_blank_regular_chat',
    profileId: '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10',
    sessions,
    marker,
    existingMarkerMatches: matches,
    modelRequests: 0,
    databaseWrites: 0,
    messageBodiesExported: false,
  };
  db.exec('COMMIT');
  const output = 'clean-control-preflight-' + Date.now() + '.json';
  writeFileSync(join(dir, output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath: output, ...report }));
} finally {
  db.close();
}
