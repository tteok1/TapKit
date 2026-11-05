ALTER TABLE runs ADD COLUMN parent_run_id TEXT REFERENCES runs(id);
DROP INDEX runs_session_active;
CREATE UNIQUE INDEX runs_session_active ON runs(session_id)
 WHERE parent_run_id IS NULL AND status IN ('running','waiting_tool','waiting_user','pausing','paused','recovering');
CREATE INDEX runs_parent ON runs(profile_id,parent_run_id,created_at);
