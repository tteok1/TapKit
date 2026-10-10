-- P03-03: keep the established project, file and resource identities.
ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT 'folder';
ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT '#64748b';
ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN allow_global_memory INTEGER NOT NULL DEFAULT 0 CHECK(allow_global_memory IN (0,1));
ALTER TABLE projects ADD COLUMN allow_global_history INTEGER NOT NULL DEFAULT 0 CHECK(allow_global_history IN (0,1));
ALTER TABLE projects ADD COLUMN allow_global_instructions INTEGER NOT NULL DEFAULT 0 CHECK(allow_global_instructions IN (0,1));
ALTER TABLE projects ADD COLUMN independent_memory INTEGER NOT NULL DEFAULT 1 CHECK(independent_memory IN (0,1));
ALTER TABLE projects ADD COLUMN defaults_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"tools":["files.read","knowledge.query","history.search"],"answer":{"language":"auto","length":"normal","tone":"natural","format":"auto"},"model":null}' CHECK(json_valid(defaults_json));
ALTER TABLE projects ADD COLUMN archived_at INTEGER;
ALTER TABLE resource_links ADD COLUMN active_index_version INTEGER NOT NULL DEFAULT 0 CHECK(active_index_version>=0);
ALTER TABLE resource_links ADD COLUMN pending_version_id TEXT REFERENCES file_versions(id);
ALTER TABLE resource_links ADD COLUMN folder_id TEXT REFERENCES folders(id);
ALTER TABLE resource_links ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json));
ALTER TABLE resource_links ADD COLUMN expires_at INTEGER;
UPDATE resource_links SET active_index_version=coalesce((SELECT index_version FROM parsed_documents p WHERE p.file_version_id=resource_links.pinned_version_id AND p.status='ready' AND p.deleted_at IS NULL),0) WHERE resource_type='file';
UPDATE resource_links SET active_index_version=1 WHERE resource_type='file' AND active_index_version=0 AND EXISTS(SELECT 1 FROM file_search_documents s JOIN file_versions v ON v.id=s.file_version_id WHERE s.file_version_id=resource_links.pinned_version_id AND s.profile_id=resource_links.profile_id AND v.parse_status='ready' AND v.parser_version IS NULL AND v.deleted_at IS NULL);
CREATE INDEX project_material_versions ON resource_links(profile_id,owner_type,owner_id,deleted_at,pinned_version_id);
CREATE INDEX project_pending_versions ON resource_links(pending_version_id) WHERE pending_version_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX projects_listing ON projects(profile_id,deleted_at,archived_at,updated_at DESC,id);
-- P03 defines the scope contract. Automatic extraction/management remains P04.
CREATE TABLE memories (
 id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,
 subject TEXT NOT NULL,predicate TEXT NOT NULL,value_json TEXT NOT NULL CHECK(json_valid(value_json)),scope_type TEXT NOT NULL CHECK(scope_type IN ('profile','project')),scope_id TEXT NOT NULL,
 explicit INTEGER NOT NULL DEFAULT 0,confidence REAL NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','deleted')),valid_from INTEGER NOT NULL,expires_at INTEGER,source_ids_json TEXT NOT NULL DEFAULT '[]',content_hash TEXT NOT NULL
);
CREATE INDEX memories_scope ON memories(profile_id,scope_type,scope_id,status,deleted_at);
