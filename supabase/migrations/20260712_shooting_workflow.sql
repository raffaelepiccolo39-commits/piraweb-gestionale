-- ============================================
-- Migration 20260712: automazione produzione contenuti da shooting
-- ============================================
-- Quando si registra uno shooting (calendar_events.event_type='shooting') per
-- un cliente, il gestionale genera una sequenza di task assegnati per ruolo con
-- scadenze relative alla data di shooting. Le ore stimate si auto-tarano dai
-- tempi reali (tasks.logged_hours) dei task già svolti.

-- Collega ogni task generato al suo shooting e al passo del flusso.
-- Serve sia per non duplicare, sia per calcolare le "ore imparate" per passo/cliente.
CREATE TABLE IF NOT EXISTS shooting_workflow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shooting_wt_step_client ON shooting_workflow_tasks(step_key, client_id);
CREATE INDEX IF NOT EXISTS idx_shooting_wt_event ON shooting_workflow_tasks(calendar_event_id);

ALTER TABLE shooting_workflow_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shooting_wt admin all" ON shooting_workflow_tasks;
CREATE POLICY "shooting_wt admin all" ON shooting_workflow_tasks
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Ore "imparate" per un passo: media dei tempi reali dei task già completati.
-- 1) se ci sono >=2 esempi per QUESTO cliente → media cliente
-- 2) altrimenti se ci sono >=3 esempi globali → media globale
-- 3) altrimenti il default passato dal chiamante.
CREATE OR REPLACE FUNCTION shooting_learned_hours(p_step_key TEXT, p_client_id UUID, p_default NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v NUMERIC; n INT;
BEGIN
  SELECT avg(t.logged_hours), count(*) INTO v, n
  FROM tasks t
  JOIN shooting_workflow_tasks s ON s.task_id = t.id
  WHERE s.step_key = p_step_key AND s.client_id = p_client_id
    AND t.status IN ('done', 'archived') AND t.logged_hours > 0;
  IF n >= 2 THEN RETURN round(v, 1); END IF;

  SELECT avg(t.logged_hours), count(*) INTO v, n
  FROM tasks t
  JOIN shooting_workflow_tasks s ON s.task_id = t.id
  WHERE s.step_key = p_step_key
    AND t.status IN ('done', 'archived') AND t.logged_hours > 0;
  IF n >= 3 THEN RETURN round(v, 1); END IF;

  RETURN p_default;
END;
$$;

REVOKE EXECUTE ON FUNCTION shooting_learned_hours(TEXT, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shooting_learned_hours(TEXT, UUID, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';
