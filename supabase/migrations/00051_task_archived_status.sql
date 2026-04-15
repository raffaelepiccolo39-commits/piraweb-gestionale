-- Aggiunge lo stato "archived" ai task
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'archived';

-- Funzione cron: archivia automaticamente i task "done" da più di 7 giorni
CREATE OR REPLACE FUNCTION archive_done_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  archived_count integer;
BEGIN
  UPDATE tasks
  SET status = 'archived', updated_at = now()
  WHERE status = 'done'
    AND updated_at < now() - interval '7 days';

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;
