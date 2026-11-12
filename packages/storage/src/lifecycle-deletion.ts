import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  ClearJobPayloadSchema,
  ClearTargetSchema,
  DeletionJournalEntrySchema,
  IdSchema,
  z,
} from '@tapkit/contracts';
import { eraseFileDerivedContent } from './file-cleanup';
import { eraseSessionContent } from './session-cleanup';
import { newId, StorageError, type Store } from './foundation';

const ClearRecord = z.strictObject({
  schemaVersion: z.literal(1),
  profileId: IdSchema,
  deletedAt: z.number().int().nonnegative(),
  operationId: IdSchema,
  clear: ClearJobPayloadSchema,
});
export const LifecycleDeletionRecordSchema = z.union([ClearRecord, DeletionJournalEntrySchema]);
export type ClearRecord = z.infer<typeof ClearRecord>;
type Target = z.infer<typeof ClearTargetSchema>;

export function writeClearRecord(store: Store, input: ClearRecord) {
  const record = ClearRecord.parse(input);
  if (record.profileId !== store.profileId || store.volatile)
    throw new StorageError('PERMISSION_DENIED');
  const file = join(store.dataDir, 'db', 'deletions.jsonl');
  const existing = existsSync(file) ? lstatSync(file) : undefined;
  if (
    existing &&
    (!existing.isFile() || existing.isSymbolicLink() || existing.size > 40 * 1024 * 1024)
  )
    throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  const old = existing ? readFileSync(file, 'utf8') : '';
  const line = JSON.stringify(record) + '\n';
  if (old && !old.endsWith('\n')) throw new StorageError('DATABASE_RECOVERY_REQUIRED');
  if ((existing?.size ?? 0) + Buffer.byteLength(line) > 64 * 1024 * 1024)
    throw new StorageError('QUOTA_EXHAUSTED');
  const temp = join(store.dataDir, 'db', 'deletions-' + newId() + '.tmp');
  const fd = openSync(temp, 'wx');
  try {
    writeFileSync(fd, old + line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, file);
}

export function eraseLifecycleTarget(store: Store, { type, id }: Target, time: number) {
  const db = store.db,
    profile = store.profileId;
  if (
    db
      .prepare(
        'SELECT 1 FROM deletion_tombstones WHERE profile_id=? AND entity_type=? AND entity_id=?',
      )
      .get(profile, type, id)
  )
    return;
  if (type === 'session') {
    eraseSessionContent(store, id, time);
    db.prepare(
      "UPDATE runs SET status='cancelled',cancel_requested_at=?,lease_epoch=lease_epoch+1 WHERE session_id=? AND profile_id=? AND status IN ('queued','running','waiting_tool','waiting_user','recovering','paused')",
    ).run(time, id, profile);
  } else if (type === 'file') {
    eraseFileDerivedContent(store, id, time);
    db.prepare(
      'DELETE FROM citations WHERE profile_id=? AND file_version_id IN (SELECT id FROM file_versions WHERE file_id=?)',
    ).run(profile, id);
    db.prepare(
      'UPDATE file_versions SET deleted_at=coalesce(deleted_at,?) WHERE profile_id=? AND file_id=?',
    ).run(time, profile, id);
    db.prepare(
      "UPDATE files SET display_name='已永久删除',source_uri=NULL,original_path_display=NULL,relative_path=NULL,deleted_at=coalesce(deleted_at,?),revision=revision+1 WHERE id=? AND profile_id=?",
    ).run(time, id, profile);
  } else if (type === 'memory') {
    db.prepare('DELETE FROM memory_search_documents WHERE memory_id=? AND profile_id=?').run(
      id,
      profile,
    );
    db.prepare('DELETE FROM memory_versions WHERE memory_id=? AND profile_id=?').run(id, profile);
    db.prepare('DELETE FROM memory_changes WHERE memory_id=? AND profile_id=?').run(id, profile);
    db.prepare(
      "DELETE FROM memory_uses WHERE kind='memory' AND resource_id=? AND profile_id=?",
    ).run(id, profile);
    db.prepare(
      "UPDATE memories SET subject='',predicate='',value_json='{}',source_ids_json='[]',content_hash='',status='deleted',deleted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND profile_id=?",
    ).run(time, time, id, profile);
  } else {
    db.prepare("DELETE FROM sidebar_items WHERE entity_type='project' AND entity_id=?").run(id);
    db.prepare(
      "DELETE FROM resource_links WHERE owner_type='project' AND owner_id=? AND profile_id=?",
    ).run(id, profile);
    db.prepare(
      "UPDATE projects SET name='已永久删除',description='',instructions='',deleted_at=?,updated_at=?,revision=revision+1 WHERE id=? AND profile_id=?",
    ).run(time, time, id, profile);
  }
  db.prepare('DELETE FROM request_receipts WHERE profile_id=? AND instr(reply_json,?)>0').run(
    profile,
    JSON.stringify(id),
  );
  db.prepare(
    "UPDATE events SET payload_json=json_set(payload_json,'$.payload',json_object('kind','workspace','entityId',?)),payload_blob_id=NULL WHERE profile_id=? AND instr(payload_json,?)>0",
  ).run(id, profile, JSON.stringify(id));
  const { seq } = db
    .prepare('SELECT coalesce(max(seq),0) seq FROM events WHERE profile_id=?')
    .get(profile) as { seq: number };
  db.prepare(
    'INSERT INTO deletion_tombstones(id,profile_id,created_at,updated_at,entity_type,entity_id,deleted_before_event_seq) VALUES(?,?,?,?,?,?,?)',
  ).run(newId(), profile, time, time, type, id, seq);
}

export function replayClearRecord(store: Store, record: ClearRecord) {
  const db = store.db,
    profile = store.profileId;
  const key = 'data.clear:' + record.operationId;
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM jobs WHERE profile_id=? AND dedupe_key=?').get(profile, key))
      return;
    for (const target of record.clear.targets)
      eraseLifecycleTarget(store, target, record.deletedAt);
    if (record.clear.targets.some(({ type }) => type === 'memory')) {
      db.prepare('INSERT OR IGNORE INTO memory_state(profile_id) VALUES(?)').run(profile);
      db.prepare('UPDATE memory_state SET generation=generation+1 WHERE profile_id=?').run(profile);
      db.prepare('DELETE FROM memory_candidates WHERE profile_id=?').run(profile);
      db.prepare(
        "UPDATE jobs SET status='cancelled',lease_epoch=lease_epoch+1,cancel_requested_at=? WHERE profile_id=? AND kind='memory.extract' AND status IN('queued','running')",
      ).run(record.deletedAt, profile);
    }
    if (record.clear.targets.some(({ type }) => type === 'session' || type === 'file'))
      db.prepare('DELETE FROM search_history WHERE profile_id=?').run(profile);
    db.prepare(
      "INSERT INTO jobs(id,profile_id,created_at,updated_at,kind,dedupe_key,payload_json,status,next_attempt_at,result_ref) VALUES(?,?,?,?,'data.clear',?,?,'queued',?,'queued')",
    ).run(
      record.operationId,
      profile,
      record.deletedAt,
      record.deletedAt,
      key,
      JSON.stringify(record.clear),
      record.deletedAt,
    );
  })();
}
