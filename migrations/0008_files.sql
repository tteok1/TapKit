ALTER TABLE files ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1));
ALTER TABLE files ADD COLUMN relative_path TEXT;
ALTER TABLE files ADD COLUMN purge_after INTEGER;
ALTER TABLE file_versions ADD COLUMN error_code TEXT;
ALTER TABLE file_versions ADD COLUMN error_reason TEXT;
ALTER TABLE file_versions ADD COLUMN preview_blob_id TEXT REFERENCES blobs(id);
ALTER TABLE file_versions ADD COLUMN restored_from_version_id TEXT REFERENCES file_versions(id);
ALTER TABLE file_versions ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE file_versions ADD COLUMN extension TEXT NOT NULL DEFAULT '';
ALTER TABLE file_versions ADD COLUMN mime TEXT NOT NULL DEFAULT 'application/octet-stream';
UPDATE file_versions SET display_name=(SELECT display_name FROM files WHERE id=file_id),
  extension=(SELECT extension FROM files WHERE id=file_id), mime=(SELECT mime FROM files WHERE id=file_id);

CREATE TABLE folders (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at INTEGER,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('file','project')), owner_id TEXT NOT NULL,
  parent_id TEXT REFERENCES folders(id), name TEXT NOT NULL, sort_key INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX folder_names ON folders(profile_id,owner_kind,owner_id,coalesce(parent_id,''),name) WHERE deleted_at IS NULL;
CREATE INDEX file_library ON files(profile_id,folder_id,deleted_at,updated_at DESC,id);

CREATE TABLE parsed_documents (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at INTEGER,
  file_version_id TEXT NOT NULL UNIQUE REFERENCES file_versions(id), parser_version TEXT NOT NULL,
  structure_blob_id TEXT NOT NULL REFERENCES blobs(id), page_count INTEGER CHECK(page_count>=0),
  quality_json TEXT NOT NULL CHECK(json_valid(quality_json) AND json_extract(quality_json,'$.schemaVersion') IS 1),
  index_version INTEGER NOT NULL DEFAULT 1 CHECK(index_version>0), status TEXT NOT NULL CHECK(status IN ('ready','failed'))
);
CREATE TABLE file_search_documents (
  file_version_id TEXT NOT NULL UNIQUE REFERENCES file_versions(id),
  file_id TEXT NOT NULL REFERENCES files(id), profile_id TEXT NOT NULL REFERENCES profiles(id), body TEXT NOT NULL
);
CREATE VIRTUAL TABLE file_content_fts USING fts5(body,content='file_search_documents',content_rowid='rowid',tokenize='trigram');
CREATE TRIGGER file_content_insert AFTER INSERT ON file_search_documents BEGIN
  INSERT INTO file_content_fts(rowid,body) VALUES(NEW.rowid,NEW.body);
END;
CREATE TRIGGER file_content_delete AFTER DELETE ON file_search_documents BEGIN
  INSERT INTO file_content_fts(file_content_fts,rowid,body) VALUES('delete',OLD.rowid,OLD.body);
END;
CREATE TRIGGER file_content_update AFTER UPDATE ON file_search_documents BEGIN
  INSERT INTO file_content_fts(file_content_fts,rowid,body) VALUES('delete',OLD.rowid,OLD.body);
  INSERT INTO file_content_fts(rowid,body) VALUES(NEW.rowid,NEW.body);
END;

-- Expand the existing durable queue; preserve its rows, leases and dedupe keys.
CREATE TABLE jobs_files (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at INTEGER,
  kind TEXT NOT NULL CHECK(kind IN ('blob.gc','data.backup','file.parse')), entity_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_extract(payload_json,'$.schemaVersion') IS 1),
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','unknown')),
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, lease_owner TEXT,
  lease_epoch INTEGER NOT NULL DEFAULT 0, lease_expires_at INTEGER, cancel_requested_at INTEGER, result_ref TEXT, error_code TEXT
);
INSERT INTO jobs_files SELECT * FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_files RENAME TO jobs;
CREATE INDEX jobs_due ON jobs(status,next_attempt_at);
