-- ============================================================
-- Data di completamento delle task: quando una task diventa "Fatto".
-- ============================================================
-- Prima non registravamo QUANDO una task veniva completata: c'era solo
-- updated_at, che però si sposta a ogni modifica successiva (un commento,
-- l'archiviazione). Impossibile costruirci sopra un calendario del rendimento.
--
-- Ora completed_at si compila da solo via trigger quando lo status passa a
-- 'done', e si azzera se la task viene riaperta. Preciso da qui in avanti.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);

-- Backfill storico: le task già 'done' prendono updated_at come data di
-- completamento. È un'approssimazione (prima non registravamo il momento
-- esatto), ma è la migliore stima disponibile per lo storico.
UPDATE tasks
SET completed_at = COALESCE(updated_at, created_at, now())
WHERE status = 'done' AND completed_at IS NULL;

-- Trigger: stampa completed_at sul passaggio a 'done', lo azzera sul ritorno.
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  ELSE  -- UPDATE
    IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
      NEW.completed_at := now();
    ELSIF NEW.status <> 'done' AND OLD.status = 'done' THEN
      NEW.completed_at := NULL;  -- riaperta: non è più completata
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_completed_at ON tasks;
CREATE TRIGGER trg_task_completed_at
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();

NOTIFY pgrst, 'reload schema';
