CREATE TABLE chunks (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  document_id TEXT REFERENCES parsed_documents(id), file_version_id TEXT NOT NULL REFERENCES file_versions(id),
  index_version INTEGER NOT NULL CHECK(index_version>0), policy_revision TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal>=0), parent_chunk_id TEXT, previous_chunk_id TEXT, next_chunk_id TEXT,
  text TEXT NOT NULL, search_text TEXT NOT NULL DEFAULT '', locator_json TEXT NOT NULL CHECK(json_valid(locator_json)),
  source_kind TEXT NOT NULL DEFAULT 'text' CHECK(source_kind IN('paragraph','heading','table','code','text','notes')),
  range_json TEXT CHECK(range_json IS NULL OR json_valid(range_json)),
  context_json TEXT NOT NULL CHECK(json_valid(context_json)), text_hash TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK(token_count>=0),
  UNIQUE(file_version_id,index_version,ordinal)
);
CREATE INDEX chunks_version ON chunks(profile_id,file_version_id,index_version);
CREATE VIRTUAL TABLE chunk_fts USING fts5(search_text,content='chunks',content_rowid='rowid',tokenize='trigram');
CREATE TRIGGER chunk_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunk_fts(rowid,search_text) VALUES(NEW.rowid,NEW.search_text);
END;
CREATE TRIGGER chunk_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunk_fts(chunk_fts,rowid,search_text) VALUES('delete',OLD.rowid,OLD.search_text);
END;
CREATE TABLE embeddings (
  chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  model_revision TEXT NOT NULL, dims INTEGER NOT NULL CHECK(dims>0), vector_blob BLOB NOT NULL,
  norm REAL NOT NULL CHECK(norm>0), status TEXT NOT NULL CHECK(status IN('ready','stale')),
  PRIMARY KEY(chunk_id,model_revision), CHECK(length(vector_blob)=dims*4)
);
CREATE TABLE citations (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  message_id TEXT NOT NULL REFERENCES messages(id), file_version_id TEXT NOT NULL REFERENCES file_versions(id),
  chunk_id TEXT REFERENCES chunks(id) ON DELETE SET NULL, locator_json TEXT NOT NULL CHECK(json_valid(locator_json)),
  quote_hash TEXT NOT NULL, claim_range_json TEXT NOT NULL CHECK(json_valid(claim_range_json)),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)), verified INTEGER NOT NULL CHECK(verified IN(0,1))
);
CREATE INDEX citation_message ON citations(profile_id,message_id);
CREATE TRIGGER chunks_reparse AFTER UPDATE OF index_version,deleted_at ON parsed_documents BEGIN
  DELETE FROM chunks WHERE file_version_id=NEW.file_version_id;
END;
CREATE TRIGGER chunks_file_removed AFTER UPDATE OF deleted_at ON files WHEN NEW.deleted_at IS NOT NULL BEGIN
  DELETE FROM chunks WHERE file_version_id IN(SELECT id FROM file_versions WHERE file_id=NEW.id);
END;
CREATE TRIGGER citations_message_removed AFTER UPDATE OF deleted_at ON messages WHEN NEW.deleted_at IS NOT NULL BEGIN
  DELETE FROM citations WHERE message_id=NEW.id;
END;
