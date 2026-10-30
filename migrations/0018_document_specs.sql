-- Structured source for generated DOCX versions; updated only by an atomic version commit.
CREATE TABLE document_specs (
 file_version_id TEXT PRIMARY KEY REFERENCES file_versions(id),
 profile_id TEXT NOT NULL REFERENCES profiles(id),
 created_at INTEGER NOT NULL,
 spec_json TEXT NOT NULL CHECK(json_valid(spec_json) AND json_extract(spec_json,'$.schemaVersion') IS 1)
);
CREATE INDEX document_specs_profile ON document_specs(profile_id,file_version_id);
