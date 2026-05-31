-- ============================================
-- Migration 00066: RPC atomico toggle pagamento + log
-- ============================================
-- handleTogglePaid lato client faceva UPDATE su client_payments e poi
-- INSERT su payment_logs in due chiamate separate: se la seconda
-- falliva (network, RLS, vincolo), lo stato veniva aggiornato ma il
-- log non veniva mai scritto → divergenza permanente tra il dato e
-- la sua audit history. Questa RPC fa entrambe le operazioni in una
-- singola transazione, con lock di riga.
--
-- Riservato all'admin: SECURITY DEFINER aggira RLS, quindi facciamo
-- il check del ruolo internamente.

CREATE OR REPLACE FUNCTION toggle_payment_paid(
  p_payment_id UUID,
  p_performed_by UUID
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
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
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
  v_new_paid_at := CASE WHEN v_new_paid THEN now() ELSE NULL END;

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
