-- Assegnazione task a più persone ("tutti alla pari").
-- task_assignees = elenco completo assegnatari. tasks.assigned_to resta come
-- "rappresentante" (primo) per compatibilità con le query/trigger esistenti.

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);

-- Backfill dagli assegnatari singoli esistenti
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assigned_to FROM tasks WHERE assigned_to IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_assignees read" ON task_assignees;
CREATE POLICY "task_assignees read" ON task_assignees FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "task_assignees write" ON task_assignees;
CREATE POLICY "task_assignees write" ON task_assignees FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true));

-- Sync: quando una task viene creata/aggiornata con assigned_to (percorsi
-- legacy: AI, booking, ecc.), assicura che l'assegnatario sia nel junction,
-- così compare nelle "mie task".
CREATE OR REPLACE FUNCTION sync_task_assigned_to()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO task_assignees (task_id, user_id)
    VALUES (NEW.id, NEW.assigned_to)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_task_assigned_to ON tasks;
CREATE TRIGGER trg_sync_task_assigned_to
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION sync_task_assigned_to();

-- RPC: imposta la lista assegnatari, aggiorna assigned_to (primo) e notifica
-- i NUOVI assegnatari aggiuntivi (il primo lo notifica già il trigger esistente
-- on_task_assigned, quindi lo escludo per non fare doppioni).
CREATE OR REPLACE FUNCTION set_task_assignees(p_task_id uuid, p_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_new uuid;
  v_title text;
  v_project uuid;
  v_actor uuid := auth.uid();
  v_primary uuid := CASE WHEN array_length(p_user_ids, 1) > 0 THEN p_user_ids[1] ELSE NULL END;
BEGIN
  SELECT title, project_id INTO v_title, v_project FROM tasks WHERE id = p_task_id;

  -- Notifica i nuovi assegnatari (esclusi: primo, chi assegna, già presenti)
  FOR v_new IN
    SELECT DISTINCT u FROM unnest(p_user_ids) AS u
    WHERE u IS DISTINCT FROM v_primary
      AND u IS DISTINCT FROM v_actor
      AND NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = p_task_id AND ta.user_id = u)
  LOOP
    PERFORM create_notification(
      v_new, 'task_assigned', 'Nuovo task assegnato',
      format('Ti è stato assegnato il task: %s', COALESCE(v_title, 'Task')),
      format('/projects/%s', v_project),
      jsonb_build_object('task_id', p_task_id, 'project_id', v_project)
    );
  END LOOP;

  -- Rimpiazza la lista assegnatari
  DELETE FROM task_assignees WHERE task_id = p_task_id AND user_id <> ALL(p_user_ids);
  INSERT INTO task_assignees (task_id, user_id)
    SELECT p_task_id, u FROM unnest(p_user_ids) AS u
    ON CONFLICT DO NOTHING;

  -- assigned_to = primo (o null); il trigger on_task_assigned notifica lui
  UPDATE tasks SET assigned_to = v_primary WHERE id = p_task_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION set_task_assignees(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_task_assignees(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
