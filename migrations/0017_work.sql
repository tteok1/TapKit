-- Append-only migration: preserve the existing chat task/run/ledger identities.
CREATE TABLE tasks_work (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, session_id TEXT NOT NULL REFERENCES sessions(id), parent_task_id TEXT,
 root_task_id TEXT NOT NULL, goal TEXT NOT NULL, acceptance_json TEXT NOT NULL CHECK(json_valid(acceptance_json)),
 mode TEXT NOT NULL CHECK(mode IN ('chat','work')), current_version INTEGER NOT NULL DEFAULT 1, acceptance_status TEXT NOT NULL DEFAULT 'unreviewed', archived_at INTEGER,
 priority INTEGER NOT NULL DEFAULT 5 CHECK(priority BETWEEN 0 AND 9), pinned_at INTEGER, muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1))
);
INSERT INTO tasks_work(id,profile_id,created_at,updated_at,revision,deleted_at,session_id,parent_task_id,root_task_id,goal,acceptance_json,mode,current_version,acceptance_status,archived_at)
 SELECT id,profile_id,created_at,updated_at,revision,deleted_at,session_id,parent_task_id,root_task_id,goal,acceptance_json,mode,current_version,acceptance_status,archived_at FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_work RENAME TO tasks;
-- Rebuilding a table also drops its triggers; preserve history indexing for both modes.
CREATE TRIGGER history_task_insert AFTER INSERT ON tasks WHEN NEW.deleted_at IS NULL BEGIN INSERT INTO history_search_documents VALUES(NEW.id,'task',NEW.profile_id,NEW.session_id,(SELECT project_id FROM sessions WHERE id=NEW.session_id),NULL,'',NEW.goal,NEW.updated_at); END;
CREATE TRIGGER history_task_update AFTER UPDATE OF goal,deleted_at ON tasks BEGIN DELETE FROM history_search_documents WHERE entity_id=NEW.id AND entity_type='task'; INSERT INTO history_search_documents SELECT NEW.id,'task',NEW.profile_id,NEW.session_id,s.project_id,NULL,s.title,NEW.goal,NEW.updated_at FROM sessions s WHERE s.id=NEW.session_id AND s.deleted_at IS NULL AND NEW.deleted_at IS NULL; END;
ALTER TABLE runs ADD COLUMN work_json TEXT NOT NULL DEFAULT '{"schemaVersion":1}' CHECK(json_valid(work_json));
CREATE TABLE plan_steps (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 run_id TEXT NOT NULL REFERENCES runs(id), step_key TEXT NOT NULL, ordinal INTEGER NOT NULL, task_version INTEGER NOT NULL,
 title TEXT NOT NULL, dependencies_json TEXT NOT NULL CHECK(json_valid(dependencies_json)), status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','skipped')),
 input_refs_json TEXT NOT NULL CHECK(json_valid(input_refs_json)), output_refs_json TEXT NOT NULL CHECK(json_valid(output_refs_json)),
 output_contract_json TEXT NOT NULL CHECK(json_valid(output_contract_json)), acceptance_json TEXT NOT NULL CHECK(json_valid(acceptance_json)),
 optional INTEGER NOT NULL CHECK(optional IN (0,1)), attempts INTEGER NOT NULL DEFAULT 0, result_text TEXT, error_code TEXT,
 UNIQUE(run_id,step_key)
);
CREATE TABLE tool_call_attempts (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), tool_call_id TEXT NOT NULL REFERENCES tool_calls(id), attempt_no INTEGER NOT NULL,
 started_at INTEGER NOT NULL, ended_at INTEGER, external_handle TEXT, error_json TEXT, UNIQUE(tool_call_id,attempt_no)
);
ALTER TABLE tool_calls ADD COLUMN step_key TEXT;
ALTER TABLE tool_calls ADD COLUMN content_hash TEXT;
ALTER TABLE tool_calls ADD COLUMN lease_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tool_calls ADD COLUMN grant_id TEXT REFERENCES grants(id);
ALTER TABLE approvals ADD COLUMN preview_json TEXT NOT NULL DEFAULT '{"schemaVersion":1}' CHECK(json_valid(preview_json));
ALTER TABLE approvals ADD COLUMN consumed_at INTEGER;
CREATE TABLE notifications (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, source_event_id TEXT NOT NULL REFERENCES events(id), kind TEXT NOT NULL, title TEXT NOT NULL,
 body_summary TEXT NOT NULL, target_json TEXT NOT NULL CHECK(json_valid(target_json)), read_at INTEGER, dedupe_key TEXT NOT NULL UNIQUE, desktop_claimed_at INTEGER
);
CREATE INDEX work_task_list ON tasks(profile_id,mode,archived_at,priority,updated_at);
CREATE INDEX plan_run ON plan_steps(run_id,ordinal);
CREATE INDEX notifications_unread ON notifications(profile_id,deleted_at,read_at,created_at);
CREATE TABLE work_consumers (profile_id TEXT NOT NULL REFERENCES profiles(id), consumer TEXT NOT NULL, last_seq INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(profile_id,consumer));
CREATE TABLE process_handles (
 id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),run_id TEXT NOT NULL REFERENCES runs(id),tool_call_id TEXT NOT NULL REFERENCES tool_calls(id),
 helper_instance_id TEXT NOT NULL,pid INTEGER,job_id TEXT NOT NULL,started_at INTEGER NOT NULL,state TEXT NOT NULL,lease_epoch INTEGER NOT NULL,identity_json TEXT NOT NULL CHECK(json_valid(identity_json))
);
