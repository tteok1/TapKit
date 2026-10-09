import type { Store } from './foundation';
export function eraseMessageContent(store: Store, id: string, time: number, keepAsNote = false) {
  const m = store.db
    .prepare('SELECT session_id,branch_id,role,run_id FROM messages WHERE id=? AND profile_id=?')
    .get(id, store.profileId) as
    { session_id: string; branch_id: string; role: string; run_id: string | null } | undefined;
  if (!m) return;
  store.db.prepare('DELETE FROM message_versions WHERE message_id=?').run(id);
  store.db.prepare('DELETE FROM message_marks WHERE message_id=?').run(id);
  store.db
    .prepare(
      "UPDATE messages SET role=CASE WHEN ? THEN 'system_note' ELSE role END,content_json=?,chat_json=?,deleted_at=CASE WHEN ? THEN deleted_at ELSE ? END,status='cancelled',revision=revision+1 WHERE id=?",
    )
    .run(
      +keepAsNote,
      JSON.stringify({
        schemaVersion: 1,
        blocks: [
          {
            kind: 'text',
            text: keepAsNote ? '此节点已删除；后续保留，已删除节点不再送入上下文。' : '',
          },
        ],
      }),
      '{"schemaVersion":1,"attachments":[],"calls":[],"model":null,"errorCode":null}',
      +keepAsNote,
      time,
      id,
    );
  if (m.run_id) {
    store.db.prepare("UPDATE provider_attempts SET public_text='' WHERE run_id=?").run(m.run_id);
    store.db
      .prepare("UPDATE tool_calls SET args_json='{}',result_ref=NULL WHERE run_id=?")
      .run(m.run_id);
  }
  // Every branch protocol cache may contain this node's ancestry. Reconstruct from visible nodes.
  store.db
    .prepare(
      'DELETE FROM opaque_states WHERE branch_id IN(SELECT id FROM branches WHERE session_id=?)',
    )
    .run(m.session_id);
  store.db
    .prepare(
      'UPDATE provider_attempts SET native_state_ref=NULL WHERE run_id IN(SELECT id FROM runs WHERE session_id=?)',
    )
    .run(m.session_id);
  if (m.role === 'user') {
    store.db
      .prepare(
        "UPDATE task_versions SET goal='' WHERE task_id IN(SELECT task_id FROM runs WHERE user_message_id=?)",
      )
      .run(id);
    store.db
      .prepare(
        "UPDATE tasks SET goal='',deleted_at=? WHERE id IN(SELECT task_id FROM runs WHERE user_message_id=?)",
      )
      .run(time, id);
    store.db
      .prepare(
        "UPDATE runs SET status='cancelled',status_reason='CANCELLED',cancel_requested_at=?,lease_epoch=lease_epoch+1 WHERE user_message_id=? AND status NOT IN('completed','partial','failed','budget_stopped','cancelled')",
      )
      .run(time, id);
  }
  if (!keepAsNote)
    store.db
      .prepare(
        'UPDATE branches SET head_message_id=(SELECT id FROM messages WHERE branch_id=? AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1) WHERE id=?',
      )
      .run(m.branch_id, m.branch_id);
}
// Numeric usage/operation identities remain; user content and protocol references do not.
// Called inside the caller's transaction, both for permanent delete and backup tombstone replay.
export function eraseSessionContent(store: Store, id: string, time: number) {
  const db = store.db;
  db.prepare('DELETE FROM history_search_documents WHERE session_id=?').run(id);
  db.prepare(
    'DELETE FROM message_marks WHERE message_id IN(SELECT id FROM messages WHERE session_id=?)',
  ).run(id);
  db.prepare(
    'DELETE FROM message_versions WHERE message_id IN(SELECT id FROM messages WHERE session_id=?)',
  ).run(id);
  db.prepare(
    "UPDATE messages SET content_json=?,chat_json=?,deleted_at=?,status='cancelled' WHERE session_id=? AND profile_id=?",
  ).run(
    '{"schemaVersion":1,"blocks":[{"kind":"text","text":""}]}',
    '{"schemaVersion":1,"attachments":[],"calls":[],"model":null,"errorCode":null}',
    time,
    id,
    store.profileId,
  );
  db.prepare('DELETE FROM drafts WHERE session_id=?').run(id);
  db.prepare(
    "UPDATE pending_inputs SET text='',refs_json='{\"schemaVersion\":1,\"refs\":[]}',status='cancelled' WHERE session_id=?",
  ).run(id);
  db.prepare(
    'UPDATE task_versions SET goal=\'\',constraints_json=\'{"schemaVersion":1,"values":[]}\',plan_json=\'{"schemaVersion":1,"steps":[]}\' WHERE task_id IN(SELECT id FROM tasks WHERE session_id=?)',
  ).run(id);
  db.prepare("UPDATE tasks SET goal='',deleted_at=? WHERE session_id=?").run(time, id);
  db.prepare(
    "UPDATE tool_calls SET args_json='{}',result_ref=NULL WHERE run_id IN(SELECT id FROM runs WHERE session_id=?)",
  ).run(id);
  db.prepare(
    "UPDATE provider_attempts SET public_text='',native_state_ref=NULL WHERE run_id IN(SELECT id FROM runs WHERE session_id=?)",
  ).run(id);
  db.prepare(
    'DELETE FROM opaque_states WHERE branch_id IN(SELECT id FROM branches WHERE session_id=?)',
  ).run(id);
  db.prepare(
    "DELETE FROM request_receipts WHERE profile_id=? AND (owner_session_id=? OR(owner_session_id IS NULL AND command='drafts.save'))",
  ).run(store.profileId, id);
  db.prepare("DELETE FROM resource_links WHERE owner_type='session' AND owner_id=?").run(id);
  db.prepare("DELETE FROM sidebar_items WHERE entity_type='session' AND entity_id=?").run(id);
  db.prepare(
    "UPDATE sessions SET title='已永久删除',note='',tags_json='[]',deleted_at=?,revision=revision+1 WHERE id=? AND profile_id=?",
  ).run(time, id, store.profileId);
}
