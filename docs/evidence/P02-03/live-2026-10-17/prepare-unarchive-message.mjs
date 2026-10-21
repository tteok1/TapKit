import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const path = join(dir, 'unarchive-baseline-2026-10-17.json');
const next = JSON.parse(readFileSync(path, 'utf8'));
if (next.archivedMessageSearch) throw Error('Archived message preparation already recorded');
const db = new DatabaseSync(join(next.dataDir, 'db/app.sqlite'), { readOnly: true });
try {
  db.exec('BEGIN');
  const state = db
    .prepare(
      'SELECT profile_id profileId,revision,archived_at archivedAt FROM sessions WHERE id=? AND deleted_at IS NULL',
    )
    .get(next.session.id);
  if (
    state?.profileId !== '01a13376-d6a6-7ca5-90dd-a27bf8a7bf10' ||
    state.revision !== next.session.revision ||
    state.archivedAt !== next.session.archivedAt
  )
    throw Error('Archived checkpoint state changed');
  const query = 'P02E-1017R';
  const hits = db
    .prepare(
      `SELECT d.entity_id id,d.entity_type type,d.session_id sessionId,d.branch_id branchId FROM history_fts f JOIN history_search_documents d ON d.rowid=f.rowid JOIN sessions s ON s.id=d.session_id WHERE history_fts MATCH ? AND d.profile_id=? AND d.session_id=? AND d.entity_type='message' AND s.deleted_at IS NULL AND s.archived_at IS NOT NULL ORDER BY d.entity_id`,
    )
    .all('"' + query + '"', state.profileId, next.session.id);
  const user = next.messages.find((m) => m.role === 'user');
  if (hits.length !== 1 || hits[0].id !== user?.id || hits[0].branchId !== next.session.branchId)
    throw Error('Archived message index target differs');
  next.status = 'prepared_waiting_archived_message_location_and_one_unarchive';
  next.archivedMessageSearch = {
    query,
    scope: { type: 'session', id: next.session.id },
    types: ['message'],
    includeArchived: true,
    expectedHits: hits,
    preflight:
      'Read-only index ID check while currently archived; not a UI pass. Actual scope/highlight/click remain for user confirmation.',
  };
  next.messageQueryHistoryBaseline = db
    .prepare('SELECT id,updated_at updatedAt FROM search_history WHERE profile_id=? AND query=?')
    .all(state.profileId, query);
  next.previousInstructions = next.instructions;
  next.instructions =
    'Close search, open left 聊天 and its 归档 filter, then open only the named copy. Ctrl+K 当前会话 + 消息, keep 包括归档 checked, search P02E-1017R and click its one result to confirm archived user-message location. Then in the 归档 list right-click P02验收-分叉副本-1017 and choose 取消归档 once. Switch to 最近, open it, verify both messages and title persist. Report both new cases; no sends/regeneration/restart or repeating passed title-filter tests.';
  next.acceptance +=
    ' Before cancellation, additionally confirm user-visible archived message location using the prepared one-result query; the unchanged-state index preflight is corroboration, not actual UI telemetry. Do not repeat already-passed archived title toggles.';
  db.exec('COMMIT');
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: 'prepared_archived_message_location_then_one_unarchive',
      sessionId: next.session.id,
      query,
      expectedHits: hits,
      agentModelRequests: 0,
      databaseWrites: 0,
    }),
  );
} finally {
  db.close();
}
