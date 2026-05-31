-- ============================================
-- Migration 00068: RPC atomico renew_client_contract
-- ============================================
-- handleRenewContract lato client faceva:
--   1) INSERT nuovo contratto
--   2) UPDATE vecchio contratto SET status='completed'
--   3) RPC generate_contract_payments
-- Se la (2) falliva (network, RLS, vincolo), restavano DUE contratti
-- 'active' per lo stesso cliente e fetchData mostrava il primo che
-- capita. Questa RPC esegue tutto in una sola transazione.

CREATE OR REPLACE FUNCTION renew_client_contract(
  p_old_contract_id UUID,
  p_client_id UUID,
  p_monthly_fee NUMERIC,
  p_duration_months INTEGER,
  p_start_date DATE,
  p_payment_timing TEXT,
  p_attachment_url TEXT,
  p_attachment_name TEXT,
  p_notes TEXT,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_new_id UUID;
BEGIN
  -- Solo admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori';
  END IF;

  -- Lock vecchio contratto per evitare race con altri admin
  PERFORM 1 FROM client_contracts WHERE id = p_old_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratto da rinnovare non trovato';
  END IF;

  -- Chiudi il vecchio
  UPDATE client_contracts
  SET status = 'completed'::contract_status
  WHERE id = p_old_contract_id;

  -- Crea il nuovo (stesso transazione)
  INSERT INTO client_contracts (
    client_id, monthly_fee, duration_months, start_date,
    payment_timing, attachment_url, attachment_name, notes, created_by
  ) VALUES (
    p_client_id, p_monthly_fee, p_duration_months, p_start_date,
    p_payment_timing::payment_timing, p_attachment_url, p_attachment_name,
    p_notes, p_created_by
  )
  RETURNING id INTO v_new_id;

  -- Genera i pagamenti del nuovo contratto
  PERFORM generate_contract_payments(v_new_id);

  RETURN v_new_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
