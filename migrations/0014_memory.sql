-- P04-03: preserve the established identities and old values.
ALTER TABLE memories ADD COLUMN write_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN sensitive INTEGER NOT NULL DEFAULT 0 CHECK(sensitive IN(0,1));
ALTER TABLE memories ADD COLUMN change_event_id TEXT;
UPDATE memories SET status='superseded' WHERE status='active' AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM memories newer WHERE newer.profile_id=memories.profile_id AND newer.scope_type=memories.scope_type AND newer.scope_id=memories.scope_id AND newer.subject=memories.subject AND newer.predicate=memories.predicate AND newer.status='active' AND newer.deleted_at IS NULL AND (newer.updated_at>memories.updated_at OR(newer.updated_at=memories.updated_at AND newer.id>memories.id)));
CREATE UNIQUE INDEX memory_active_key ON memories(profile_id,scope_type,scope_id,subject,predicate) WHERE status='active' AND deleted_at IS NULL;
CREATE TABLE memory_state(profile_id TEXT PRIMARY KEY REFERENCES profiles(id), generation INTEGER NOT NULL DEFAULT 1);
CREATE TABLE memory_versions(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),memory_id TEXT NOT NULL REFERENCES memories(id),version INTEGER NOT NULL,value_json TEXT NOT NULL,source_ids_json TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL CHECK(actor IN('user','model')),created_at INTEGER NOT NULL,UNIQUE(memory_id,version));
CREATE TABLE memory_tombstones(profile_id TEXT NOT NULL REFERENCES profiles(id),scope_type TEXT NOT NULL,scope_id TEXT NOT NULL,subject TEXT NOT NULL,predicate TEXT NOT NULL,deleted_before_event_seq INTEGER NOT NULL,PRIMARY KEY(profile_id,scope_type,scope_id,subject,predicate));
CREATE TABLE memory_changes(event_id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),memory_id TEXT NOT NULL REFERENCES memories(id),before_json TEXT,after_revision INTEGER NOT NULL,created_at INTEGER NOT NULL,undone INTEGER NOT NULL DEFAULT 0);
CREATE TABLE memory_search_documents(memory_id TEXT UNIQUE NOT NULL REFERENCES memories(id),profile_id TEXT NOT NULL,body TEXT NOT NULL);
CREATE VIRTUAL TABLE memory_fts USING fts5(body,content='memory_search_documents',content_rowid='rowid',tokenize='trigram');
CREATE TRIGGER memory_search_insert AFTER INSERT ON memory_search_documents BEGIN INSERT INTO memory_fts(rowid,body) VALUES(NEW.rowid,NEW.body); END;
CREATE TRIGGER memory_search_delete AFTER DELETE ON memory_search_documents BEGIN INSERT INTO memory_fts(memory_fts,rowid,body) VALUES('delete',OLD.rowid,OLD.body); END;
INSERT INTO memory_search_documents SELECT id,profile_id,predicate||' '||coalesce(json_extract(value_json,'$.value'),value_json) FROM memories WHERE status='active' AND deleted_at IS NULL;
CREATE TABLE jobs_memory (
 id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),deleted_at INTEGER,
 kind TEXT NOT NULL CHECK(kind IN('blob.gc','data.backup','file.parse','memory.extract')),entity_id TEXT,dedupe_key TEXT NOT NULL UNIQUE,payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_extract(payload_json,'$.schemaVersion') IS 1),status TEXT NOT NULL CHECK(status IN('queued','running','completed','failed','cancelled','unknown')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,lease_owner TEXT,lease_epoch INTEGER NOT NULL DEFAULT 0,lease_expires_at INTEGER,cancel_requested_at INTEGER,result_ref TEXT,error_code TEXT
);
INSERT INTO jobs_memory SELECT * FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_memory RENAME TO jobs;
CREATE INDEX jobs_due ON jobs(status,next_attempt_at);
CREATE TABLE memory_candidates(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),job_id TEXT REFERENCES jobs(id),source_ids_json TEXT NOT NULL,candidate_json TEXT NOT NULL,scope_type TEXT NOT NULL,scope_id TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN('written','skipped','conflict')),reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE memory_uses(message_id TEXT NOT NULL REFERENCES messages(id),profile_id TEXT NOT NULL REFERENCES profiles(id),kind TEXT NOT NULL CHECK(kind IN('memory','history')),resource_id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(message_id,kind,resource_id));
