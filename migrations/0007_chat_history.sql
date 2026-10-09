ALTER TABLE sessions ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json));
ALTER TABLE sessions ADD COLUMN title_manual INTEGER NOT NULL DEFAULT 0 CHECK(title_manual IN (0,1));
ALTER TABLE projects ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN pinned_at INTEGER;
ALTER TABLE branches ADD COLUMN candidate_for_message_id TEXT;
ALTER TABLE messages ADD COLUMN source_message_id TEXT;
ALTER TABLE request_receipts ADD COLUMN owner_session_id TEXT;
CREATE TABLE sidebar_sections (id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),name TEXT NOT NULL,collapsed INTEGER NOT NULL DEFAULT 0,sort_key INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE sidebar_items (profile_id TEXT NOT NULL REFERENCES profiles(id),entity_type TEXT NOT NULL CHECK(entity_type IN ('session','project')),entity_id TEXT NOT NULL,section_id TEXT REFERENCES sidebar_sections(id) ON DELETE SET NULL,sort_key INTEGER NOT NULL,PRIMARY KEY(profile_id,entity_type,entity_id));
CREATE INDEX sidebar_section_order ON sidebar_items(profile_id,section_id,sort_key,entity_id);
CREATE TABLE message_marks (message_id TEXT PRIMARY KEY REFERENCES messages(id),profile_id TEXT NOT NULL REFERENCES profiles(id),bookmark INTEGER NOT NULL DEFAULT 0,rating TEXT CHECK(rating IN ('up','down')),note TEXT NOT NULL DEFAULT '',report INTEGER NOT NULL DEFAULT 0);
CREATE TABLE search_history (id TEXT PRIMARY KEY,profile_id TEXT NOT NULL REFERENCES profiles(id),query TEXT NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(profile_id,query));
CREATE TABLE title_jobs (session_id TEXT PRIMARY KEY REFERENCES sessions(id),profile_id TEXT NOT NULL REFERENCES profiles(id),run_id TEXT NOT NULL,expected_revision INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')));
CREATE TABLE history_search_documents(entity_id TEXT NOT NULL,entity_type TEXT NOT NULL,profile_id TEXT NOT NULL,session_id TEXT,project_id TEXT,branch_id TEXT,title TEXT NOT NULL,body TEXT NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(entity_id,entity_type));
CREATE INDEX history_documents_profile_time ON history_search_documents(profile_id,updated_at DESC,entity_id);
CREATE INDEX history_documents_session ON history_search_documents(session_id,entity_type);
CREATE INDEX history_documents_project ON history_search_documents(project_id,entity_type);
CREATE VIRTUAL TABLE history_fts USING fts5(entity_id UNINDEXED,entity_type UNINDEXED,profile_id UNINDEXED,session_id UNINDEXED,project_id UNINDEXED,branch_id UNINDEXED,title,body,updated_at UNINDEXED,content='history_search_documents',content_rowid='rowid',tokenize='trigram');
CREATE TRIGGER history_document_insert AFTER INSERT ON history_search_documents BEGIN INSERT INTO history_fts(rowid,entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) VALUES(NEW.rowid,NEW.entity_id,NEW.entity_type,NEW.profile_id,NEW.session_id,NEW.project_id,NEW.branch_id,NEW.title,NEW.body,NEW.updated_at); END;
CREATE TRIGGER history_document_delete AFTER DELETE ON history_search_documents BEGIN INSERT INTO history_fts(history_fts,rowid,entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) VALUES('delete',OLD.rowid,OLD.entity_id,OLD.entity_type,OLD.profile_id,OLD.session_id,OLD.project_id,OLD.branch_id,OLD.title,OLD.body,OLD.updated_at); END;
CREATE TRIGGER history_document_update AFTER UPDATE ON history_search_documents BEGIN INSERT INTO history_fts(history_fts,rowid,entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) VALUES('delete',OLD.rowid,OLD.entity_id,OLD.entity_type,OLD.profile_id,OLD.session_id,OLD.project_id,OLD.branch_id,OLD.title,OLD.body,OLD.updated_at); INSERT INTO history_fts(rowid,entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) VALUES(NEW.rowid,NEW.entity_id,NEW.entity_type,NEW.profile_id,NEW.session_id,NEW.project_id,NEW.branch_id,NEW.title,NEW.body,NEW.updated_at); END;

INSERT INTO history_search_documents(entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) SELECT id,'session',profile_id,id,project_id,NULL,title,note,updated_at FROM sessions WHERE deleted_at IS NULL;
INSERT INTO history_search_documents(entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) SELECT m.id,'message',m.profile_id,m.session_id,s.project_id,m.branch_id,s.title,coalesce(json_extract(m.content_json,'$.blocks[0].text'),''),m.updated_at FROM messages m JOIN sessions s ON s.id=m.session_id WHERE m.deleted_at IS NULL AND s.deleted_at IS NULL AND m.role IN ('user','assistant') AND m.status IN ('final','interrupted');
INSERT INTO history_search_documents(entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) SELECT id,'project',profile_id,NULL,id,NULL,name,instructions,updated_at FROM projects WHERE deleted_at IS NULL;
INSERT INTO history_search_documents(entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) SELECT t.id,'task',t.profile_id,t.session_id,s.project_id,NULL,s.title,t.goal,t.updated_at FROM tasks t JOIN sessions s ON s.id=t.session_id WHERE t.deleted_at IS NULL AND s.deleted_at IS NULL;
INSERT INTO history_search_documents(entity_id,entity_type,profile_id,session_id,project_id,branch_id,title,body,updated_at) SELECT id,'file',profile_id,NULL,NULL,NULL,display_name,'',updated_at FROM files WHERE deleted_at IS NULL;
CREATE TRIGGER history_message_insert AFTER INSERT ON messages WHEN NEW.deleted_at IS NULL AND NEW.role IN ('user','assistant') AND NEW.status IN ('final','interrupted') BEGIN
 INSERT INTO history_search_documents VALUES(NEW.id,'message',NEW.profile_id,NEW.session_id,(SELECT project_id FROM sessions WHERE id=NEW.session_id),NEW.branch_id,(SELECT title FROM sessions WHERE id=NEW.session_id),coalesce(json_extract(NEW.content_json,'$.blocks[0].text'),''),NEW.updated_at);
END;
CREATE TRIGGER history_message_update AFTER UPDATE OF content_json,status,deleted_at ON messages BEGIN
 DELETE FROM history_search_documents WHERE entity_id=NEW.id AND entity_type='message';
 INSERT INTO history_search_documents SELECT NEW.id,'message',NEW.profile_id,NEW.session_id,s.project_id,NEW.branch_id,s.title,coalesce(json_extract(NEW.content_json,'$.blocks[0].text'),''),NEW.updated_at FROM sessions s WHERE s.id=NEW.session_id AND s.deleted_at IS NULL AND NEW.deleted_at IS NULL AND NEW.role IN ('user','assistant') AND NEW.status IN ('final','interrupted');
END;
CREATE TRIGGER history_message_delete AFTER DELETE ON messages BEGIN DELETE FROM history_search_documents WHERE entity_id=OLD.id AND entity_type='message'; END;
CREATE TRIGGER history_session_insert AFTER INSERT ON sessions WHEN NEW.deleted_at IS NULL BEGIN INSERT INTO history_search_documents VALUES(NEW.id,'session',NEW.profile_id,NEW.id,NEW.project_id,NULL,NEW.title,NEW.note,NEW.updated_at); END;
CREATE TRIGGER history_session_update AFTER UPDATE OF title,note,project_id,deleted_at ON sessions BEGIN
 DELETE FROM history_search_documents WHERE entity_id=NEW.id AND entity_type='session';
 INSERT INTO history_search_documents SELECT NEW.id,'session',NEW.profile_id,NEW.id,NEW.project_id,NULL,NEW.title,NEW.note,NEW.updated_at WHERE NEW.deleted_at IS NULL;
 UPDATE history_search_documents SET title=NEW.title,project_id=NEW.project_id WHERE session_id=NEW.id;
 DELETE FROM history_search_documents WHERE session_id=NEW.id AND NEW.deleted_at IS NOT NULL;
END;
CREATE TRIGGER history_project_insert AFTER INSERT ON projects WHEN NEW.deleted_at IS NULL BEGIN INSERT INTO history_search_documents VALUES(NEW.id,'project',NEW.profile_id,NULL,NEW.id,NULL,NEW.name,NEW.instructions,NEW.updated_at); END;
CREATE TRIGGER history_project_update AFTER UPDATE OF name,instructions,deleted_at ON projects BEGIN DELETE FROM history_search_documents WHERE entity_id=NEW.id AND entity_type='project'; INSERT INTO history_search_documents SELECT NEW.id,'project',NEW.profile_id,NULL,NEW.id,NULL,NEW.name,NEW.instructions,NEW.updated_at WHERE NEW.deleted_at IS NULL; END;
CREATE TRIGGER history_task_insert AFTER INSERT ON tasks WHEN NEW.deleted_at IS NULL BEGIN INSERT INTO history_search_documents VALUES(NEW.id,'task',NEW.profile_id,NEW.session_id,(SELECT project_id FROM sessions WHERE id=NEW.session_id),NULL,'',NEW.goal,NEW.updated_at); END;
CREATE TRIGGER history_task_update AFTER UPDATE OF goal,deleted_at ON tasks BEGIN DELETE FROM history_search_documents WHERE entity_id=NEW.id AND entity_type='task'; INSERT INTO history_search_documents SELECT NEW.id,'task',NEW.profile_id,NEW.session_id,s.project_id,NULL,s.title,NEW.goal,NEW.updated_at FROM sessions s WHERE s.id=NEW.session_id AND s.deleted_at IS NULL AND NEW.deleted_at IS NULL; END;
CREATE TRIGGER history_file_insert AFTER INSERT ON files WHEN NEW.deleted_at IS NULL BEGIN INSERT INTO history_search_documents VALUES(NEW.id,'file',NEW.profile_id,NULL,NULL,NULL,NEW.display_name,'',NEW.updated_at); END;
CREATE TRIGGER history_file_update AFTER UPDATE OF display_name,deleted_at ON files BEGIN DELETE FROM history_search_documents WHERE entity_id=NEW.id AND entity_type='file'; INSERT INTO history_search_documents SELECT NEW.id,'file',NEW.profile_id,NULL,NULL,NULL,NEW.display_name,'',NEW.updated_at WHERE NEW.deleted_at IS NULL; END;
