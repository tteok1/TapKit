ALTER TABLE file_versions ADD COLUMN preview_renderer_version TEXT;
CREATE TABLE reading_positions (
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  file_version_id TEXT NOT NULL REFERENCES file_versions(id),
  position_json TEXT NOT NULL CHECK(json_valid(position_json)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,file_version_id)
);
CREATE TABLE pdf_annotations (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  file_version_id TEXT NOT NULL REFERENCES file_versions(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  deleted_at INTEGER,
  annotation_json TEXT NOT NULL CHECK(json_valid(annotation_json))
);
CREATE INDEX annotations_version ON pdf_annotations(profile_id,file_version_id,deleted_at);
