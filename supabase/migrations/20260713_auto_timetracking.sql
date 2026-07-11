-- ============================================
-- Migration 20260713: time tracking garantito (A: timer auto, B: blocco Fatto)
-- ============================================
-- Problema: spostando una task in "In corso" (bacheca/menù) il timer non
-- partiva → ore a zero. Soluzioni:
--  A) il timer parte/si ferma automaticamente col cambio di stato;
--  B) non si può mettere "Fatto" una task su cui non è stato tracciato nulla;
--  + pulizia notturna dei timer lasciati aperti (anti-runaway).

-- ── A) Timer automatico legato allo stato ──
-- Una sola task attiva per persona: entrando in "In corso" chiude gli altri
-- timer aperti dell'utente e avvia questo; uscendo da "In corso" lo ferma.
CREATE OR REPLACE FUNCTION auto_task_timer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  -- Avvia il timer solo se chi sposta è un assegnatario della task, così un
  -- admin che riordina la bacheca non registra ore per sbaglio.
  IF NEW.status = 'in_progress' AND v_uid IS NOT NULL
     AND (NEW.assigned_to = v_uid
          OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = NEW.id AND user_id = v_uid))
  THEN
    UPDATE time_entries SET ended_at = now(), is_running = false
      WHERE user_id = v_uid AND is_running = true AND task_id <> NEW.id;
    IF NOT EXISTS (
      SELECT 1 FROM time_entries
      WHERE task_id = NEW.id AND user_id = v_uid AND is_running = true
    ) THEN
      INSERT INTO time_entries (task_id, user_id, started_at, is_running)
      VALUES (NEW.id, v_uid, now(), true);
    END IF;
  END IF;

  IF OLD.status = 'in_progress' AND NEW.status <> 'in_progress' THEN
    UPDATE time_entries SET ended_at = now(), is_running = false
      WHERE task_id = NEW.id AND is_running = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_task_timer ON tasks;
CREATE TRIGGER trg_auto_task_timer
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION auto_task_timer();

-- ── B) Non si può completare una task mai tracciata ──
-- Vale solo per gli utenti umani (auth.uid() non null); i processi di sistema
-- (service role, cron) non vengono bloccati.
CREATE OR REPLACE FUNCTION require_hours_on_done()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status <> 'done' AND auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM time_entries WHERE task_id = NEW.id) THEN
      RAISE EXCEPTION 'Registra le ore prima di completare la task: avvia il timer o inserisci le ore lavorate.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_hours_on_done ON tasks;
CREATE TRIGGER trg_require_hours_on_done
  BEFORE UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION require_hours_on_done();

-- ── Pulizia notturna: chiude i timer rimasti aperti da prima di oggi,
-- limitando la durata a un massimo di 8 ore (anti-runaway). ──
CREATE OR REPLACE FUNCTION close_stale_time_entries()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE n INT;
BEGIN
  WITH upd AS (
    UPDATE time_entries
    SET ended_at = LEAST(now(), started_at + interval '8 hours'),
        is_running = false
    WHERE is_running = true
      AND started_at < date_trunc('day', now())
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION close_stale_time_entries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_stale_time_entries() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
