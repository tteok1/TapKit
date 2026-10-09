import type { Store } from './foundation';

// Used by permanent deletion and journal replay after restoring an older backup.
export function eraseFileDerivedContent(store: Store, fileId: string, time: number) {
  const versions = store.db
    .prepare(
      'SELECT id,blob_id,preview_blob_id,deleted_at FROM file_versions WHERE file_id=? AND profile_id=?',
    )
    .all(fileId, store.profileId) as {
    id: string;
    blob_id: string;
    preview_blob_id: string | null;
    deleted_at: number | null;
  }[];
  for (const v of versions) {
    if (v.deleted_at === null) {
      store.db
        .prepare('UPDATE blobs SET reference_count=max(0,reference_count-1) WHERE id=?')
        .run(v.blob_id);
      if (v.preview_blob_id)
        store.db
          .prepare('UPDATE blobs SET reference_count=max(0,reference_count-1) WHERE id=?')
          .run(v.preview_blob_id);
    }
    const derived = store.db
      .prepare(
        'SELECT structure_blob_id FROM parsed_documents WHERE file_version_id=? AND deleted_at IS NULL',
      )
      .get(v.id) as { structure_blob_id: string } | undefined;
    if (derived)
      store.db
        .prepare('UPDATE blobs SET reference_count=max(0,reference_count-1) WHERE id=?')
        .run(derived.structure_blob_id);
    store.db.prepare('DELETE FROM file_search_documents WHERE file_version_id=?').run(v.id);
    store.db
      .prepare('UPDATE parsed_documents SET deleted_at=? WHERE file_version_id=?')
      .run(time, v.id);
    store.db
      .prepare(
        "UPDATE jobs SET status='cancelled',cancel_requested_at=?,lease_epoch=lease_epoch+1,lease_owner=NULL,lease_expires_at=NULL WHERE kind='file.parse' AND json_extract(payload_json,'$.fileVersionId')=? AND status IN('queued','running')",
      )
      .run(time, v.id);
  }
  store.db
    .prepare(
      "UPDATE resource_links SET deleted_at=?,revision=revision+1 WHERE resource_type='file' AND resource_id=? AND profile_id=? AND deleted_at IS NULL",
    )
    .run(time, fileId, store.profileId);
}
