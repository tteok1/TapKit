CREATE TABLE research_snapshots (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  run_id TEXT NOT NULL REFERENCES runs(id),
  file_version_id TEXT NOT NULL REFERENCES file_versions(id),
  snapshot_blob_id TEXT NOT NULL REFERENCES blobs(id),
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX research_snapshots_owner ON research_snapshots(profile_id,run_id);
CREATE TRIGGER research_blob_insert AFTER INSERT ON research_snapshots BEGIN
  UPDATE blobs SET reference_count=reference_count+1 WHERE id=NEW.snapshot_blob_id;
END;
CREATE TRIGGER research_blob_delete AFTER DELETE ON research_snapshots BEGIN
  UPDATE blobs SET reference_count=reference_count-1 WHERE id=OLD.snapshot_blob_id;
END;
