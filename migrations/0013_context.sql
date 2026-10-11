CREATE TABLE checkpoints (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
 session_id TEXT NOT NULL REFERENCES sessions(id), branch_id TEXT NOT NULL REFERENCES branches(id),
 task_id TEXT REFERENCES tasks(id), task_version INTEGER NOT NULL, run_id TEXT REFERENCES runs(id),
 event_seq_from INTEGER NOT NULL, event_seq_to INTEGER NOT NULL, schema_version INTEGER NOT NULL CHECK(schema_version=1),
 state_json TEXT NOT NULL CHECK(json_valid(state_json)), validation_json TEXT NOT NULL CHECK(json_valid(validation_json)),
 sources_json TEXT NOT NULL CHECK(json_valid(sources_json)), corrected INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX checkpoints_branch ON checkpoints(profile_id,session_id,branch_id,created_at DESC,id DESC);
CREATE TABLE context_snapshots (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), run_id TEXT NOT NULL REFERENCES runs(id),
 logical_call_id TEXT NOT NULL, model_ref TEXT NOT NULL, prompt_version TEXT NOT NULL, tool_catalog_version TEXT NOT NULL,
 checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL, ordered_refs_json TEXT NOT NULL CHECK(json_valid(ordered_refs_json)),
 token_estimate_json TEXT NOT NULL CHECK(json_valid(token_estimate_json)), native_state_ref TEXT, created_at INTEGER NOT NULL
);
ALTER TABLE sessions ADD COLUMN context_seed_json TEXT CHECK(context_seed_json IS NULL OR json_valid(context_seed_json));
ALTER TABLE sessions ADD COLUMN context_version INTEGER NOT NULL DEFAULT 1;
