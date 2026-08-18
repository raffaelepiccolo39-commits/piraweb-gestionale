-- ============================================================
-- CRM — sequenza di follow-up sulla proposta (§8.2)
-- ============================================================
--
-- Non è un job schedulato ma un trigger: la specifica lo attiva sull'evento
-- "cambio stage -> 5", e un evento si intercetta dove accade. Un cron che
-- ogni notte cerca le proposte inviate ieri farebbe la stessa cosa con un
-- giorno di ritardo e con più modi di sbagliare.
--
-- Le quattro attività sono TASK, non invii automatici: in v1 i follow-up si
-- mandano a mano (§13). Qui si crea solo il promemoria.
--
-- Owner degli step: la specifica assegna 1 e 4 a Sales Ops e 2 e 3 al CEO.
-- Il ruolo Sales Ops non esiste ancora nell'enum user_role, quindi:
--   step 1 e 4 -> owner dell'opportunità (chi la sta seguendo)
--   step 2 e 3 -> primo admin (il CEO)
-- Quando il ruolo esisterà, si cambia solo questa funzione.
--
-- ORDINE DI ESECUZIONE: dopo 20260818b.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_sequenza_followup()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ceo    UUID;
  v_giorni SMALLINT[] := ARRAY[2, 5, 10, 20];
  v_step   SMALLINT;
BEGIN
  -- ── Entrata nello stage 5: si programma la sequenza ──────
  IF NEW.stage_id = 5 AND (TG_OP = 'INSERT' OR OLD.stage_id IS DISTINCT FROM 5) THEN
    SELECT id INTO v_ceo FROM profiles WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1;

    FOR v_step IN 1..4 LOOP
      INSERT INTO crm_attivita (
        deal_id, tipo, titolo, descrizione, owner_id, due_at,
        origine, sequenza, sequenza_step, chiave_job
      ) VALUES (
        NEW.id,
        'task',
        format('Follow-up proposta %s/4', v_step),
        format('Sequenza automatica: %s giorni dall''invio della proposta.', v_giorni[v_step]),
        CASE WHEN v_step IN (1, 4) THEN NEW.owner_id ELSE COALESCE(v_ceo, NEW.owner_id) END,
        NEW.data_ingresso_stage + (v_giorni[v_step] || ' days')::interval,
        'automazione',
        'followup_proposta',
        v_step,
        format('followup_proposta:%s', v_step)
      )
      ON CONFLICT DO NOTHING;   -- rientrare nello stage 5 non duplica la sequenza
    END LOOP;
  END IF;

  -- ── Uscita dallo stage 5: la sequenza non ha più senso ───
  -- Vale sia avanzando (6, 7) sia tornando indietro: se la trattativa si è
  -- mossa, continuare a ricordare "richiama per la proposta" è rumore.
  IF TG_OP = 'UPDATE' AND OLD.stage_id = 5 AND NEW.stage_id <> 5 THEN
    UPDATE crm_attivita
       SET stato = 'annullata'
     WHERE deal_id = NEW.id
       AND sequenza = 'followup_proposta'
       AND stato = 'aperta';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_5_followup_proposta ON deals;
CREATE TRIGGER crm_5_followup_proposta
  AFTER INSERT OR UPDATE OF stage_id ON deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_sequenza_followup();

COMMENT ON FUNCTION public.crm_sequenza_followup() IS
  '§8.2: crea le 4 attività di follow-up entrando nello stage 5 e le annulla uscendone.';

NOTIFY pgrst, 'reload schema';
