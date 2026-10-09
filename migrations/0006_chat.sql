ALTER TABLE messages ADD COLUMN client_message_id TEXT;
ALTER TABLE messages ADD COLUMN chat_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"attachments":[],"calls":[],"model":null,"errorCode":null}';
CREATE UNIQUE INDEX messages_client_id ON messages(profile_id,client_message_id) WHERE client_message_id IS NOT NULL;
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, session_id TEXT NOT NULL REFERENCES sessions(id), parent_task_id TEXT,
 root_task_id TEXT NOT NULL, goal TEXT NOT NULL, acceptance_json TEXT NOT NULL CHECK(json_valid(acceptance_json)),
 mode TEXT NOT NULL CHECK(mode='chat'), current_version INTEGER NOT NULL DEFAULT 1, acceptance_status TEXT NOT NULL DEFAULT 'unreviewed', archived_at INTEGER
);
CREATE TABLE task_versions (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 task_id TEXT NOT NULL REFERENCES tasks(id), version INTEGER NOT NULL, goal TEXT NOT NULL, constraints_json TEXT NOT NULL CHECK(json_valid(constraints_json)),
 source_event_id TEXT, plan_json TEXT NOT NULL CHECK(json_valid(plan_json)), UNIQUE(task_id,version)
);
CREATE TABLE runs (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 deleted_at INTEGER, task_id TEXT NOT NULL REFERENCES tasks(id), task_version INTEGER NOT NULL, root_run_id TEXT NOT NULL,
 session_id TEXT NOT NULL REFERENCES sessions(id), user_message_id TEXT NOT NULL REFERENCES messages(id), assistant_message_id TEXT REFERENCES messages(id),
 status TEXT NOT NULL CHECK(status IN ('queued','running','waiting_tool','waiting_user','pausing','paused','recovering','completed','partial','failed','budget_stopped','cancelled')),
 status_reason TEXT, lease_owner TEXT, lease_epoch INTEGER NOT NULL DEFAULT 0, lease_expires_at INTEGER, cancel_requested_at INTEGER, pause_requested_at INTEGER,
 checkpoint_id TEXT, budget_id TEXT, started_at INTEGER, ended_at INTEGER, calls INTEGER NOT NULL DEFAULT 0, tools INTEGER NOT NULL DEFAULT 0,
 model_json TEXT NOT NULL CHECK(json_valid(model_json))
);
CREATE INDEX runs_schedule ON runs(status,lease_expires_at);
CREATE UNIQUE INDEX runs_session_active ON runs(session_id) WHERE status IN ('running','waiting_tool','waiting_user','pausing','paused','recovering');
CREATE TABLE pending_inputs (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 session_id TEXT NOT NULL REFERENCES sessions(id), client_request_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('steer','followup')), text TEXT NOT NULL,
 refs_json TEXT NOT NULL CHECK(json_valid(refs_json)), status TEXT NOT NULL CHECK(status IN ('queued','accepted','cancelled')), target_task_version INTEGER,
 target_run_id TEXT REFERENCES runs(id), user_message_id TEXT NOT NULL REFERENCES messages(id), payload_hash TEXT NOT NULL,
 UNIQUE(profile_id,client_request_id)
);
CREATE TABLE tool_calls (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 run_id TEXT NOT NULL REFERENCES runs(id), task_version INTEGER NOT NULL, call_id TEXT NOT NULL, tool_name TEXT NOT NULL, tool_version TEXT NOT NULL,
 args_json TEXT NOT NULL CHECK(json_valid(args_json)), args_hash TEXT NOT NULL, resource_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 approval_id TEXT, status TEXT NOT NULL CHECK(status IN ('proposed','approved','dispatched','pending','succeeded','partial','failed','unknown','cancelled')),
 side_effect TEXT NOT NULL CHECK(side_effect IN ('none','committed','not_committed','unknown')), result_ref TEXT,
 UNIQUE(profile_id,idempotency_key)
);
CREATE INDEX tool_calls_run ON tool_calls(run_id,status);
CREATE TABLE prompt_snippets (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), name TEXT NOT NULL, text TEXT NOT NULL);
