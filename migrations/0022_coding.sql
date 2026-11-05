CREATE TABLE code_projects (
 id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
 canonical_root TEXT NOT NULL, state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE worktrees (
 run_id TEXT PRIMARY KEY REFERENCES runs(id), code_project_id TEXT NOT NULL REFERENCES code_projects(id),
 canonical_path TEXT NOT NULL, managed_repo_path TEXT, branch TEXT, base_commit TEXT,
 state TEXT NOT NULL CHECK(state IN ('prepared','revoked','unknown')), state_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
