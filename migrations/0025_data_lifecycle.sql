CREATE TABLE jobs_lifecycle (
 id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),deleted_at INTEGER,
 kind TEXT NOT NULL CHECK(kind IN('blob.gc','data.backup','file.parse','memory.extract','snapshot.export','data.clear')),entity_id TEXT,dedupe_key TEXT NOT NULL UNIQUE,payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_extract(payload_json,'$.schemaVersion') IS 1),status TEXT NOT NULL CHECK(status IN('queued','running','completed','failed','cancelled','unknown')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,lease_owner TEXT,lease_epoch INTEGER NOT NULL DEFAULT 0,lease_expires_at INTEGER,cancel_requested_at INTEGER,result_ref TEXT,error_code TEXT
);
-- Copy queue rows without changing the job IDs referenced by memory candidates.
INSERT INTO jobs_lifecycle SELECT * FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_lifecycle RENAME TO jobs;
CREATE INDEX jobs_due ON jobs(status,next_attempt_at);
ALTER TABLE memories ADD COLUMN imported INTEGER NOT NULL DEFAULT 0 CHECK(imported IN(0,1));
