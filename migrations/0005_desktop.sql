-- P02-01: metadata-only shell creation; no project files or execution capability.
ALTER TABLE sessions ADD COLUMN pinned_at INTEGER;
ALTER TABLE provider_accounts ADD COLUMN credential_hint TEXT CHECK(credential_hint IS NULL OR length(credential_hint)<=4);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at INTEGER,
  name TEXT NOT NULL
);
