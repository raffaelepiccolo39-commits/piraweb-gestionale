-- ============================================
-- Migration 00069: RPC distinct task assignees per progetto
-- ============================================
-- /projects/page caricava TUTTI i task di TUTTI i progetti via PostgREST
-- nested select `tasks(assigned_to)` solo per contare gli assegnatari
-- distinti. Su 50 progetti × 30 task = 1500 righe scaricate inutilmente
-- in client. Questa RPC fa l'aggregazione lato DB.

CREATE OR REPLACE FUNCTION get_project_task_assignees()
RETURNS TABLE (project_id UUID, assignees UUID[])
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT project_id, array_agg(DISTINCT assigned_to)
  FROM tasks
  WHERE assigned_to IS NOT NULL
    AND status <> 'archived'
  GROUP BY project_id;
$$;

NOTIFY pgrst, 'reload schema';
