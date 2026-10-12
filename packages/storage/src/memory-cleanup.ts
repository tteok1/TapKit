import type { Store } from './foundation';
// Source deletion is shared by normal deletion and the durable deletion-journal replay.
export function invalidateMemorySources(store: Store, messageIds: string[], keepExplicit = false) {
  const ids = new Set(messageIds);
  if (!ids.size) return;
  store.db.prepare('INSERT OR IGNORE INTO memory_state(profile_id) VALUES(?)').run(store.profileId);
  store.db
    .prepare('UPDATE memory_state SET generation=generation+1 WHERE profile_id=?')
    .run(store.profileId);
  const rows = store.db
    .prepare("SELECT * FROM memories WHERE profile_id=? AND status='active' AND deleted_at IS NULL")
    .all(store.profileId) as {
    id: string;
    source_ids_json: string;
    explicit: number;
    scope_type: string;
    scope_id: string;
    subject: string;
    predicate: string;
  }[];
  for (const row of rows) {
    const sources = JSON.parse(row.source_ids_json) as ({ messageId: string } | string)[];
    const remaining = sources.filter((s) => !ids.has(typeof s === 'string' ? s : s.messageId));
    if (remaining.length === sources.length) continue;
    const deleted = row.explicit ? !remaining.length && !keepExplicit : remaining.length < 2;
    store.db.prepare('DELETE FROM memory_search_documents WHERE memory_id=?').run(row.id);
    if (deleted) {
      store.db.prepare("DELETE FROM memory_uses WHERE kind='memory' AND resource_id=?").run(row.id);
      store.db
        .prepare(
          "UPDATE memories SET status='deleted',deleted_at=?,value_json='{}',source_ids_json='[]',revision=revision+1,updated_at=? WHERE id=?",
        )
        .run(store.now(), store.now(), row.id);
      const seq = (
        store.db
          .prepare('SELECT coalesce(max(seq),0) n FROM events WHERE profile_id=?')
          .get(store.profileId) as { n: number }
      ).n;
      store.db
        .prepare(
          'INSERT INTO memory_tombstones VALUES(?,?,?,?,?,?) ON CONFLICT(profile_id,scope_type,scope_id,subject,predicate) DO UPDATE SET deleted_before_event_seq=max(deleted_before_event_seq,excluded.deleted_before_event_seq)',
        )
        .run(store.profileId, row.scope_type, row.scope_id, row.subject, row.predicate, seq);
      store.db.prepare('DELETE FROM memory_versions WHERE memory_id=?').run(row.id);
      store.db.prepare('DELETE FROM memory_changes WHERE memory_id=?').run(row.id);
    } else {
      store.db
        .prepare(
          'UPDATE memories SET source_ids_json=?,revision=revision+1,updated_at=? WHERE id=?',
        )
        .run(JSON.stringify(remaining), store.now(), row.id);
      const body = store.db
        .prepare('SELECT predicate,value_json FROM memories WHERE id=?')
        .get(row.id) as { predicate: string; value_json: string };
      store.db
        .prepare('INSERT INTO memory_search_documents VALUES(?,?,?)')
        .run(row.id, store.profileId, body.predicate + ' ' + body.value_json);
      store.db.prepare('DELETE FROM memory_versions WHERE memory_id=?').run(row.id);
      store.db.prepare('DELETE FROM memory_changes WHERE memory_id=?').run(row.id);
    }
    store.emit('memory.changed', {
      kind: 'memory',
      memoryId: row.id,
      changeEventId: row.id,
      status: deleted ? 'deleted' : 'written',
      sensitive: false,
    });
  }
  // Candidate records are audit decisions, never a second store of deleted user text.
  const candidates = store.db
    .prepare('SELECT id,source_ids_json FROM memory_candidates WHERE profile_id=?')
    .all(store.profileId) as { id: string; source_ids_json: string }[];
  for (const c of candidates)
    if (
      (JSON.parse(c.source_ids_json) as { messageId: string }[]).some((s) => ids.has(s.messageId))
    )
      store.db.prepare('DELETE FROM memory_candidates WHERE id=?').run(c.id);
  for (const id of ids) {
    store.db
      .prepare("DELETE FROM memory_uses WHERE (kind='history' AND resource_id=?) OR message_id=?")
      .run(id, id);
    store.db
      .prepare(
        "UPDATE jobs SET status='cancelled',cancel_requested_at=? WHERE kind='memory.extract' AND json_extract(payload_json,'$.messageId')=? AND status IN('queued','running')",
      )
      .run(store.now(), id);
  }
}
