-- ============================================================
-- Batch fix 2026-07-07 — da eseguire nel SQL Editor di Supabase
-- ============================================================
-- Contiene 4 fix DB. Puoi incollarlo tutto insieme ed eseguire.
-- (Le ALTER TYPE dell'enum notifiche stanno nel file separato
--  20260707b_notification_enum_backfill.sql: esegui QUELLO per primo
--  se non l'hai ancora fatto — va lanciato da solo.)

-- ------------------------------------------------------------
-- FIX 1 — RPC update_project_with_members mancante in prod.
-- Errore: "Could not find the function public.update_project_with_members
-- ... in the schema cache" quando si salva la modifica di un progetto.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_project_with_members(
  p_project_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_client_id UUID,
  p_status TEXT,
  p_color TEXT,
  p_deadline DATE,
  p_member_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_can_edit BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project_id
        AND (p.created_by = v_uid
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p_project_id AND pm.user_id = v_uid))
    ) INTO v_can_edit;
    IF NOT v_can_edit THEN
      RAISE EXCEPTION 'Non sei autorizzato a modificare questo progetto';
    END IF;
  END IF;

  UPDATE projects SET
    name = p_name,
    description = p_description,
    client_id = p_client_id,
    status = p_status::project_status,
    color = p_color,
    deadline = p_deadline,
    updated_at = now()
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progetto non trovato';
  END IF;

  DELETE FROM project_members WHERE project_id = p_project_id;

  IF p_member_ids IS NOT NULL AND array_length(p_member_ids, 1) > 0 THEN
    INSERT INTO project_members (project_id, user_id)
    SELECT p_project_id, m FROM unnest(p_member_ids) AS m;
  END IF;

  RETURN p_project_id;
END;
$fn$;

-- ------------------------------------------------------------
-- FIX 2 — Notifica completamento task: solo agli admin.
-- Prima notificava il CREATORE DEL PROGETTO: un collaboratore che
-- aveva creato un progetto riceveva "X ha completato il task" ogni
-- volta. Ora la notifica va solo agli admin (escluso chi completa).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_task_completed()
RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    PERFORM create_notification(
      p.id,
      'task_completed',
      'Task completato',
      format('Il task "%s" è stato completato', NEW.title),
      CASE WHEN NEW.project_id IS NOT NULL
           THEN format('/projects/%s', NEW.project_id)
           ELSE '/bacheca' END,
      jsonb_build_object('task_id', NEW.id, 'project_id', NEW.project_id)
    )
    FROM profiles p
    WHERE p.role = 'admin' AND p.is_active = true AND p.id <> auth.uid();
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- FIX 3 — Monte ferie: 2 gg/mese + bonus, con TETTO massimo a 24.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accrued_vacation_days(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_contract_start date;
  v_effective_start date;
  v_months integer;
  v_bonus numeric;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT contract_start_date, COALESCE(vacation_bonus_days, 0)
    INTO v_contract_start, v_bonus
    FROM profiles WHERE id = p_user_id;

  IF v_contract_start IS NULL THEN RETURN LEAST(COALESCE(v_bonus, 0), 24); END IF;

  v_effective_start := GREATEST(v_contract_start, DATE '2026-06-01');
  IF v_effective_start > v_today THEN RETURN LEAST(COALESCE(v_bonus, 0), 24); END IF;

  v_months := (EXTRACT(YEAR FROM v_today) - EXTRACT(YEAR FROM v_effective_start))::int * 12
            + (EXTRACT(MONTH FROM v_today) - EXTRACT(MONTH FROM v_effective_start))::int;
  IF EXTRACT(DAY FROM v_today) < EXTRACT(DAY FROM v_effective_start) THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN v_months := 0; END IF;

  -- 2 giorni al mese + bonus, ma mai oltre 24 giorni.
  RETURN LEAST((v_months * 2)::numeric + COALESCE(v_bonus, 0), 24);
END;
$fn$;

-- ------------------------------------------------------------
-- FIX 4 — Screenshot bug non visibili: il bucket è privato ma il
-- codice usa getPublicUrl(). Lo rendo pubblico (i path hanno un
-- UUID casuale, non elencabile).
-- ------------------------------------------------------------
UPDATE storage.buckets SET public = true WHERE id = 'dev-note-screenshots';

NOTIFY pgrst, 'reload schema';
