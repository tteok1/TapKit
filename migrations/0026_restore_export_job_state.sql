-- Rebuilding jobs in schema 25 dropped the export status trigger.
CREATE TRIGGER export_job_state AFTER UPDATE OF status ON jobs
WHEN NEW.kind='snapshot.export' AND NEW.status IN('queued','running','completed','failed','cancelled')
BEGIN
  UPDATE exports SET state=NEW.status, updated_at=NEW.updated_at,
    progress=CASE WHEN NEW.status='completed' THEN 100 ELSE progress END,
    error_code=CASE WHEN NEW.status='cancelled' THEN 'CANCELLED' ELSE error_code END
  WHERE job_id=NEW.id AND profile_id=NEW.profile_id;
END;

-- Recover persisted projections in profiles that ran while the trigger was absent.
UPDATE exports AS e
SET state=j.status,
    updated_at=max(e.updated_at,j.updated_at),
    progress=CASE WHEN j.status='completed' THEN 100 ELSE e.progress END,
    error_code=CASE
      WHEN e.error_code='SIDE_EFFECT_UNKNOWN' THEN e.error_code
      WHEN j.status='cancelled' THEN CASE WHEN e.progress>=85 THEN 'SIDE_EFFECT_UNKNOWN' ELSE 'CANCELLED' END
      WHEN j.status='failed' THEN coalesce(e.error_code,j.error_code,CASE WHEN e.progress>=85 THEN 'SIDE_EFFECT_UNKNOWN' ELSE 'STREAM_INTERRUPTED' END)
      ELSE e.error_code END
FROM jobs AS j
WHERE j.id=e.job_id AND j.profile_id=e.profile_id AND j.kind='snapshot.export'
  AND j.status IN('queued','running','completed','failed','cancelled')
  AND (e.state<>j.status OR (j.status='completed' AND e.progress<>100));
