-- ============================================
-- Migration 00063: Field-lock per employee_expenses
-- ============================================
-- L'RLS permette al dipendente di fare UPDATE sulla propria expense
-- ancora pending. Senza ulteriori controlli, un client malizioso può
-- chiamare l'API direttamente e modificare amount, ricevuta, categoria,
-- ecc. dopo l'invio. La UI non espone modifica, ma vogliamo blindare
-- comunque il flusso a livello DB.
--
-- Questo trigger BEFORE UPDATE rifiuta ogni cambiamento dei campi
-- "critici" se l'utente non è admin. I non-admin possono solo:
--   - modificare `description` (campo libero)
-- L'admin può modificare tutto (può sistemare errori del dipendente).

CREATE OR REPLACE FUNCTION employee_expenses_field_lock()
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

  -- Dipendente: blocca modifiche ai campi protetti
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Non puoi cambiare il proprietario della nota spese';
  END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Non puoi cambiare l''importo dopo l''invio. Annulla la richiesta e creane una nuova.';
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    RAISE EXCEPTION 'Non puoi cambiare la categoria dopo l''invio.';
  END IF;
  IF NEW.incurred_on IS DISTINCT FROM OLD.incurred_on THEN
    RAISE EXCEPTION 'Non puoi cambiare la data della spesa dopo l''invio.';
  END IF;
  IF NEW.receipt_path IS DISTINCT FROM OLD.receipt_path THEN
    RAISE EXCEPTION 'Non puoi sostituire la ricevuta dopo l''invio.';
  END IF;

  -- Solo l'admin può cambiare lo status (approva/rifiuta/paga)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Non puoi cambiare lo stato della nota spese.';
  END IF;

  -- Solo l'admin tocca i campi review e paid_at
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_note IS DISTINCT FROM OLD.review_note
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'Non autorizzato a modificare i campi di revisione.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_expenses_field_lock_trigger ON employee_expenses;
CREATE TRIGGER employee_expenses_field_lock_trigger
  BEFORE UPDATE ON employee_expenses
  FOR EACH ROW
  EXECUTE FUNCTION employee_expenses_field_lock();

NOTIFY pgrst, 'reload schema';
