-- ============================================
-- Migration 00064: Field-lock per time_off_requests
-- ============================================
-- Stessa logica del 00063 ma per ferie/permessi/malattia.
-- Il dipendente, nonostante la RLS UPDATE su pending, può solo:
--   - editare `reason` (testo libero)
--   - annullare la richiesta (status pending → cancelled)
-- Tutti gli altri campi sono protetti contro modifiche da API diretta.
-- L'admin mantiene il pieno controllo.

CREATE OR REPLACE FUNCTION time_off_requests_field_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Non puoi cambiare il proprietario della richiesta';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'Non puoi cambiare il tipo di assenza. Annulla e creane una nuova.';
  END IF;
  IF NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.start_half IS DISTINCT FROM OLD.start_half
     OR NEW.end_half IS DISTINCT FROM OLD.end_half THEN
    RAISE EXCEPTION 'Non puoi modificare le date della richiesta. Annulla e creane una nuova.';
  END IF;

  -- Status: dipendente può solo annullare la propria pending
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Non puoi cambiare lo stato della richiesta. L''unica transizione consentita è pending → cancelled.';
    END IF;
  END IF;

  -- Campi review riservati all'admin
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_note IS DISTINCT FROM OLD.review_note THEN
    RAISE EXCEPTION 'Non autorizzato a modificare i campi di revisione.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_off_requests_field_lock_trigger ON time_off_requests;
CREATE TRIGGER time_off_requests_field_lock_trigger
  BEFORE UPDATE ON time_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION time_off_requests_field_lock();

NOTIFY pgrst, 'reload schema';
