-- ============================================
-- Migration 20260610b: data pagamento personalizzabile in toggle_payment_paid
-- ============================================
-- Finora paid_at veniva sempre impostato a now() al momento del click.
-- Ora l'admin può indicare la data effettiva in cui il cliente ha pagato
-- (es. registrare pagamenti arretrati / retrodatati). Nuovo parametro
-- opzionale p_paid_at: se NULL si usa now() come prima.
--
-- Nota: il timestamp dell'audit log (payment_logs.created_at, default now())
-- resta il momento reale della registrazione — è corretto che diverga dalla
-- data del pagamento.
--
-- La firma cambia (2 -> 3 argomenti): droppo la vecchia versione per evitare
-- overload ambigui via PostgREST.

DROP FUNCTION IF EXISTS toggle_payment_paid(UUID, UUID);

CREATE OR REPLACE FUNCTION toggle_payment_paid(
  p_payment_id UUID,
  p_performed_by UUID,
  p_paid_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (id UUID, is_paid BOOLEAN, paid_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment client_payments%ROWTYPE;
  v_client_id UUID;
  v_new_paid BOOLEAN;
  v_new_paid_at TIMESTAMPTZ;
BEGIN
  -- Check di autorizzazione: solo l'admin può cambiare lo stato di un pagamento
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori';
  END IF;

  -- Lock di riga per evitare race (due admin che toggleano contemporaneamente)
  SELECT * INTO v_payment FROM client_payments WHERE client_payments.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento non trovato';
  END IF;

  -- Risali al client_id via il contratto (non fidarsi del client)
  SELECT client_id INTO v_client_id FROM client_contracts WHERE client_contracts.id = v_payment.contract_id;

  v_new_paid := NOT v_payment.is_paid;
  -- Se sto registrando il pagamento uso la data scelta (o now() se assente);
  -- se sto annullando, azzero.
  v_new_paid_at := CASE WHEN v_new_paid THEN COALESCE(p_paid_at, now()) ELSE NULL END;

  UPDATE client_payments
  SET is_paid = v_new_paid, paid_at = v_new_paid_at
  WHERE client_payments.id = p_payment_id;

  INSERT INTO payment_logs (
    payment_id, contract_id, client_id, action, amount,
    month_index, due_date, performed_by
  ) VALUES (
    p_payment_id,
    v_payment.contract_id,
    v_client_id,
    CASE WHEN v_new_paid THEN 'paid' ELSE 'unpaid' END,
    v_payment.amount,
    v_payment.month_index,
    v_payment.due_date,
    p_performed_by
  );

  RETURN QUERY SELECT p_payment_id, v_new_paid, v_new_paid_at;
END;
$$;

NOTIFY pgrst, 'reload schema';
