-- P02 saved notes linked their original version without a pin. Repair only
-- that known producer, pinning version 1 rather than a subsequently replaced
-- current version. Invalid, deleted, and cross-profile references stay denied.
UPDATE file_versions AS v
SET display_name='收藏笔记.md',extension='md',mime='text/markdown'
WHERE v.version=1 AND v.display_name='' AND v.deleted_at IS NULL
  AND EXISTS(SELECT 1 FROM files f WHERE f.id=v.file_id AND f.profile_id=v.profile_id
    AND f.kind='note' AND f.source_type='generated' AND f.deleted_at IS NULL);

UPDATE resource_links AS l
SET pinned_version_id=(
  SELECT v.id FROM file_versions v
  WHERE v.file_id=l.resource_id AND v.profile_id=l.profile_id
    AND v.version=1 AND v.deleted_at IS NULL
), revision=revision+1
WHERE l.resource_type='file' AND l.role='input'
  AND l.pinned_version_id IS NULL AND l.deleted_at IS NULL
  AND EXISTS(SELECT 1 FROM files f JOIN file_versions v ON v.file_id=f.id
    WHERE f.id=l.resource_id AND f.profile_id=l.profile_id
      AND f.kind='note' AND f.source_type='generated' AND f.deleted_at IS NULL
      AND v.profile_id=f.profile_id AND v.version=1 AND v.deleted_at IS NULL)
  AND ((l.owner_type='session' AND EXISTS(SELECT 1 FROM sessions s
      WHERE s.id=l.owner_id AND s.profile_id=l.profile_id AND s.deleted_at IS NULL))
    OR (l.owner_type='project' AND EXISTS(SELECT 1 FROM projects p
      WHERE p.id=l.owner_id AND p.profile_id=l.profile_id AND p.deleted_at IS NULL)));
