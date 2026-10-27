-- Preserve the queue identities and dependent memory_candidates references.
DROP TRIGGER IF EXISTS web_session_removed;
CREATE TABLE jobs_exports (
 id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),deleted_at INTEGER,
 kind TEXT NOT NULL CHECK(kind IN('blob.gc','data.backup','file.parse','memory.extract','snapshot.export')),entity_id TEXT,dedupe_key TEXT NOT NULL UNIQUE,payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_extract(payload_json,'$.schemaVersion') IS 1),status TEXT NOT NULL CHECK(status IN('queued','running','completed','failed','cancelled','unknown')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,lease_owner TEXT,lease_epoch INTEGER NOT NULL DEFAULT 0,lease_expires_at INTEGER,cancel_requested_at INTEGER,result_ref TEXT,error_code TEXT
);
INSERT INTO jobs_exports SELECT * FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_exports RENAME TO jobs;
CREATE INDEX jobs_due ON jobs(status,next_attempt_at);
CREATE TABLE exports (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  source_kind TEXT NOT NULL, source_id TEXT NOT NULL, snapshot_version TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN('md','txt','html','pdf','zip')),
  options_json TEXT NOT NULL CHECK(json_valid(options_json)),
  job_id TEXT NOT NULL REFERENCES jobs(id),
  name TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN('queued','running','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), error_code TEXT
);
CREATE INDEX exports_profile ON exports(profile_id,created_at);
CREATE TRIGGER export_job_state AFTER UPDATE OF status ON jobs BEGIN
 UPDATE exports SET state=NEW.status,updated_at=NEW.updated_at,
  progress=CASE WHEN NEW.status='completed' THEN 100 ELSE progress END,
  error_code=CASE WHEN NEW.status='cancelled' THEN 'CANCELLED' ELSE error_code END
 WHERE job_id=NEW.id AND NEW.status IN('queued','running','completed','failed','cancelled');
END;
