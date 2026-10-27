CREATE TABLE web_sources (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  session_id TEXT NOT NULL REFERENCES sessions(id), run_id TEXT NOT NULL REFERENCES runs(id),
  url TEXT NOT NULL, canonical_url TEXT NOT NULL, title TEXT NOT NULL, fetched_at INTEGER NOT NULL,
  http_status INTEGER NOT NULL, snapshot_blob_id TEXT NOT NULL REFERENCES blobs(id),
  content_hash TEXT NOT NULL, access_type TEXT NOT NULL CHECK(access_type='public'),
  source_revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX web_source_session ON web_sources(profile_id,session_id,fetched_at);
CREATE TRIGGER web_blob_added AFTER INSERT ON web_sources BEGIN
 UPDATE blobs SET reference_count=reference_count+1 WHERE id=NEW.snapshot_blob_id;
END;
CREATE TRIGGER web_blob_removed AFTER DELETE ON web_sources BEGIN
 UPDATE blobs SET reference_count=reference_count-1 WHERE id=OLD.snapshot_blob_id;
END;
ALTER TABLE sessions ADD COLUMN web_options_json TEXT NOT NULL DEFAULT '{"mode":"auto","domains":[],"excludeDomains":[]}';
ALTER TABLE citations RENAME TO citations_file;
DROP INDEX citation_message;
DROP TRIGGER citations_message_removed;
CREATE TABLE citations (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  message_id TEXT NOT NULL REFERENCES messages(id), file_version_id TEXT REFERENCES file_versions(id),
  web_source_id TEXT REFERENCES web_sources(id), chunk_id TEXT REFERENCES chunks(id) ON DELETE SET NULL,
  locator_json TEXT NOT NULL CHECK(json_valid(locator_json)), quote_hash TEXT NOT NULL,
  claim_range_json TEXT NOT NULL CHECK(json_valid(claim_range_json)),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)), verified INTEGER NOT NULL CHECK(verified IN(0,1)),
  CHECK((file_version_id IS NOT NULL) != (web_source_id IS NOT NULL))
);
INSERT INTO citations(id,profile_id,message_id,file_version_id,chunk_id,locator_json,quote_hash,claim_range_json,evidence_json,verified)
 SELECT id,profile_id,message_id,file_version_id,chunk_id,locator_json,quote_hash,claim_range_json,evidence_json,verified FROM citations_file;
DROP TABLE citations_file;
CREATE INDEX citation_message ON citations(profile_id,message_id);
CREATE TRIGGER citations_message_removed AFTER UPDATE OF deleted_at ON messages WHEN NEW.deleted_at IS NOT NULL BEGIN
 DELETE FROM citations WHERE message_id=NEW.id;
END;
