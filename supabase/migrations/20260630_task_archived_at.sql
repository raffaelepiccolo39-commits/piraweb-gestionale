-- ============================================
-- Archivio task ortogonale: archived_at al posto dello stato 'archived'
-- ============================================
-- Prima: archiviare una task significava status = 'archived', perdendo il suo
-- stato reale (un "Fatto" archiviato non era più "Fatto").
-- Ora: archived_at è una colonna separata. La task mantiene il suo stato
-- (todo/in_progress/review/done) anche da archiviata, e può essere ripristinata.
-- "Archiviata" = archived_at IS NOT NULL, indipendentemente dallo status.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at);

-- Backfill: le task attualmente in stato 'archived' diventano archiviate via
-- archived_at e recuperano uno stato reale ('done', poiché venivano archiviate
-- automaticamente/manualmente solo da completate).
UPDATE tasks
SET archived_at = COALESCE(updated_at, now()),
    status = 'done'
WHERE status = 'archived';

-- Cron: archivia le task 'done' ferme da più di 7 giorni usando archived_at.
CREATE OR REPLACE FUNCTION archive_done_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  archived_count integer;
BEGIN
  UPDATE tasks
  SET archived_at = now()
  WHERE status = 'done'
    AND archived_at IS NULL
    AND updated_at < now() - interval '7 days';

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

-- Assegnatari distinti per progetto: esclude le task archiviate via archived_at
-- (prima escludeva status = 'archived').
CREATE OR REPLACE FUNCTION get_project_task_assignees()
RETURNS TABLE (project_id UUID, assignees UUID[])
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT project_id, array_agg(DISTINCT assigned_to)
  FROM tasks
  WHERE assigned_to IS NOT NULL
    AND archived_at IS NULL
  GROUP BY project_id;
$$;

NOTIFY pgrst, 'reload schema';
