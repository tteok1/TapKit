CREATE TABLE browser_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  root_run_id TEXT NOT NULL REFERENCES runs(id),
  partition_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('open','closed','interrupted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE browser_tabs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  session_id TEXT NOT NULL REFERENCES browser_sessions(id),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  navigation_epoch INTEGER NOT NULL DEFAULT 0,
  last_snapshot_id TEXT,
  mode TEXT NOT NULL DEFAULT 'agent' CHECK(mode IN ('agent','user')),
  state TEXT NOT NULL CHECK(state IN ('open','closed','interrupted')),
  updated_at INTEGER NOT NULL
);
CREATE TABLE browser_snapshots (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  tab_id TEXT NOT NULL REFERENCES browser_tabs(id),
  navigation_epoch INTEGER NOT NULL,
  snapshot_seq INTEGER NOT NULL,
  dom_json TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  UNIQUE(tab_id,snapshot_seq)
);
CREATE INDEX browser_session_root ON browser_sessions(profile_id,root_run_id,state);
CREATE INDEX browser_tab_session ON browser_tabs(session_id,state);
