CREATE TABLE canvas_documents (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  current_version_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source_json TEXT NOT NULL
);
CREATE INDEX canvas_recent ON canvas_documents(profile_id, updated_at DESC, id);

CREATE TABLE canvas_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES canvas_documents(id) ON DELETE CASCADE,
  parent_version_id TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  UNIQUE(document_id, revision)
);

CREATE TABLE canvas_exports (
  file_version_id TEXT PRIMARY KEY REFERENCES file_versions(id) ON DELETE CASCADE,
  canvas_version_id TEXT NOT NULL REFERENCES canvas_versions(id)
);
