-- ============================================
-- Migration 20260712b: copertura piano editoriale + avviso shooting
-- ============================================
-- Testa del ciclo: per ogni cliente sappiamo fino a quando è coperto il piano
-- editoriale (data che Bernis segna completando la task "Programmare post e
-- storie"). Un monitoraggio avvisa l'admin 14 giorni prima della scadenza di
-- programmare uno shooting e apre uno slot nel calendario.

CREATE TABLE IF NOT EXISTS client_ped_coverage (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  covered_until DATE,
  -- covered_until per cui è già stato mandato l'avviso (evita ripetizioni)
  alert_sent_for DATE,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_ped_coverage ENABLE ROW LEVEL SECURITY;

-- Lettura a tutti gli autenticati (serve alla task di Bernis per pre-compilare).
DROP POLICY IF EXISTS "ped_coverage select" ON client_ped_coverage;
CREATE POLICY "ped_coverage select" ON client_ped_coverage
  FOR SELECT TO authenticated USING (true);

-- Scrittura diretta solo admin; Bernis scrive via RPC set_ped_coverage.
DROP POLICY IF EXISTS "ped_coverage admin write" ON client_ped_coverage;
CREATE POLICY "ped_coverage admin write" ON client_ped_coverage
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Imposta la copertura PED. Consentito ad admin e social_media_manager (Bernis).
-- Reimposta alert_sent_for a NULL così il nuovo ciclo può far scattare l'avviso.
CREATE OR REPLACE FUNCTION set_ped_coverage(p_client_id UUID, p_covered_until DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'social_media_manager')
  ) THEN
    RAISE EXCEPTION 'Non autorizzato a impostare la copertura del piano editoriale';
  END IF;

  INSERT INTO client_ped_coverage (client_id, covered_until, alert_sent_for, updated_by, updated_at)
  VALUES (p_client_id, p_covered_until, NULL, auth.uid(), now())
  ON CONFLICT (client_id) DO UPDATE
    SET covered_until = EXCLUDED.covered_until,
        alert_sent_for = NULL,
        updated_by = auth.uid(),
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION set_ped_coverage(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_ped_coverage(UUID, DATE) TO authenticated;

-- Il collegamento shooting→task era admin-only: serve la lettura anche a Bernis
-- (social) per mostrare il campo "programmato fino a" nella sua task.
DROP POLICY IF EXISTS "shooting_wt read all" ON shooting_workflow_tasks;
CREATE POLICY "shooting_wt read all" ON shooting_workflow_tasks
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
