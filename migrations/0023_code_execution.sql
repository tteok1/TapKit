CREATE TABLE runtime_profiles (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL REFERENCES profiles(id),
 run_id TEXT NOT NULL REFERENCES runs(id),
 runtime TEXT NOT NULL CHECK(runtime IN ('node','python')),
 state_json TEXT NOT NULL CHECK(json_valid(state_json)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(profile_id,run_id,runtime)
);
ALTER TABLE process_handles ADD COLUMN process_json TEXT CHECK(process_json IS NULL OR json_valid(process_json));
CREATE INDEX code_process_run ON process_handles(profile_id,run_id,started_at);
