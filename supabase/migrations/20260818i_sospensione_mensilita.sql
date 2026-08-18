-- ============================================================
-- Sospensione delle mensilità: la parte che non è mai arrivata
-- ============================================================
--
-- La 20260716b_payment_month_suspension non è mai stata applicata in
-- produzione. Il codice però è stato scritto per lei: cinque pagine — CFO,
-- Clienti, Report clienti, Dashboard e Direzione — filtrano su
-- `client_payments.is_suspended`, e una colonna che non esiste fa rispondere
-- 42703 a PostgREST. Da qui il "CFO non funziona": la pagina mostra
-- l'errore invece dei dati.
--
-- Anche il calendario dei pagamenti ha da sempre il pulsante per sospendere
-- una mensilità, e chiama toggle_payment_suspended: una procedura che in
-- produzione non c'è. La funzione era completa nell'interfaccia e non ha
-- mai funzionato.
--
-- PERCHÉ NON SI RILANCIA LA 20260716b COM'È:
-- quella migration ridefinisce anche get_cashflow_summary,
-- get_cashflow_monthly e get_revenue_per_client nella versione di luglio,
-- cioè PRIMA che la 20260814g vi aggiungesse la guardia del secondo fattore.
-- Applicarla riaprirebbe un buco chiuso dall'audit di sicurezza del 14
-- agosto. Qui si prende tutto il resto e si lasciano stare quelle tre.
--
-- Le quattro procedure incluse qui sotto non hanno versioni più recenti
-- altrove: verificato migration per migration.
-- ============================================================
-- ============================================================
-- 1. Colonne
-- ============================================================
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_client_payments_suspended
  ON client_payments(contract_id) WHERE is_suspended = true;

-- Una mensilità sospesa non può essere pagata (e viceversa): le due RPC lo
-- impediscono già, il vincolo protegge da scritture diverse.
ALTER TABLE client_payments DROP CONSTRAINT IF EXISTS chk_payment_not_paid_and_suspended;
ALTER TABLE client_payments ADD CONSTRAINT chk_payment_not_paid_and_suspended
  CHECK (NOT (is_paid AND is_suspended));

-- ============================================================
-- 2. Audit log: nuove azioni 'suspended' / 'resumed'
-- ============================================================
-- Il CHECK della 00013 è inline sulla colonna, quindi il nome è generato da
-- Postgres: si assume payment_logs_action_check ma non è garantito. Se il nome
-- reale fosse un altro, un DROP ... IF EXISTS mirato non lo toglierebbe e il
-- vecchio vincolo continuerebbe a rifiutare 'suspended'/'resumed' — errore che
-- salterebbe fuori solo al primo click. Meglio cercarlo per definizione.
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'payment_logs'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE payment_logs DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE payment_logs ADD CONSTRAINT payment_logs_action_check
  CHECK (action IN ('paid', 'unpaid', 'suspended', 'resumed'));

-- ============================================================
-- 3. Riallineamento della coda del contratto
-- ============================================================
-- Mantiene l'invariante: mensilità dovute = duration_months.
-- Sospendi una rata → ne aggiunge una in coda. Riattivala → toglie quella in
-- coda. Idempotente: si può richiamare senza effetti se i conti già tornano.
CREATE OR REPLACE FUNCTION reconcile_contract_tail(p_contract_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract client_contracts%ROWTYPE;
  v_due_count INTEGER;
  v_next_slot INTEGER;
  v_victim UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori';
  END IF;

  SELECT * INTO v_contract FROM client_contracts cc WHERE cc.id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contratto non trovato'; END IF;

  -- Clienti "senza contratto" (duration 0): nessuna rata da riallineare.
  IF COALESCE(v_contract.duration_months, 0) <= 0 THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_due_count
  FROM client_payments cp
  WHERE cp.contract_id = p_contract_id AND cp.is_suspended = false;

  -- Mancano mensilità dovute → allunga la coda
  WHILE v_due_count < v_contract.duration_months LOOP
    SELECT COALESCE(MAX(cp.month_index), -1) + 1 INTO v_next_slot
    FROM client_payments cp WHERE cp.contract_id = p_contract_id;

    INSERT INTO client_payments (contract_id, month_index, due_date, amount)
    VALUES (
      p_contract_id,
      v_next_slot,
      v_contract.start_date + (v_next_slot || ' months')::INTERVAL,
      v_contract.monthly_fee
    );
    v_due_count := v_due_count + 1;
  END LOOP;

  -- Mensilità dovute in eccesso → accorcia la coda.
  -- Si tocca SOLO l'ultimo slot, e solo se è ancora intonso: mai una rata
  -- pagata, mai una con storico movimenti (payment_logs va in CASCADE e
  -- l'audit log si perderebbe). Se non è eliminabile si esce e il contratto
  -- resta con un mese in più, che l'admin sistema a mano.
  WHILE v_due_count > v_contract.duration_months LOOP
    SELECT cp.id INTO v_victim
    FROM client_payments cp
    WHERE cp.contract_id = p_contract_id
      AND cp.is_suspended = false
      AND cp.is_paid = false
      AND cp.month_index = (
        SELECT MAX(cp2.month_index) FROM client_payments cp2 WHERE cp2.contract_id = p_contract_id
      )
      AND NOT EXISTS (SELECT 1 FROM payment_logs pl WHERE pl.payment_id = cp.id)
    LIMIT 1;

    EXIT WHEN v_victim IS NULL;

    DELETE FROM client_payments cp WHERE cp.id = v_victim;
    v_due_count := v_due_count - 1;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. Sospendi / riattiva una mensilità
-- ============================================================
CREATE OR REPLACE FUNCTION toggle_payment_suspended(
  p_payment_id UUID,
  p_performed_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, is_suspended BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment client_payments%ROWTYPE;
  v_client_id UUID;
  v_new_suspended BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori';
  END IF;

  SELECT * INTO v_payment FROM client_payments cp WHERE cp.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mensilità non trovata'; END IF;

  IF v_payment.is_paid THEN
    RAISE EXCEPTION 'Questa mensilità risulta pagata: annulla prima il pagamento, poi sospendila';
  END IF;

  SELECT cc.client_id INTO v_client_id
  FROM client_contracts cc WHERE cc.id = v_payment.contract_id;

  v_new_suspended := NOT v_payment.is_suspended;

  UPDATE client_payments cp SET
    is_suspended = v_new_suspended,
    suspended_at = CASE WHEN v_new_suspended THEN now() ELSE NULL END,
    suspension_reason = CASE
      WHEN v_new_suspended THEN NULLIF(btrim(COALESCE(p_reason, '')), '')
      ELSE NULL
    END
  WHERE cp.id = p_payment_id;

  -- Il contratto si allunga (sospensione) o si accorcia (riattivazione)
  PERFORM reconcile_contract_tail(v_payment.contract_id);

  INSERT INTO payment_logs (
    payment_id, contract_id, client_id, action, amount, month_index, due_date, performed_by
  )
  VALUES (
    p_payment_id, v_payment.contract_id, v_client_id,
    CASE WHEN v_new_suspended THEN 'suspended' ELSE 'resumed' END,
    v_payment.amount, v_payment.month_index, v_payment.due_date, p_performed_by
  );

  RETURN QUERY SELECT p_payment_id, v_new_suspended;
END;
$$;

-- ============================================================
-- 5. Registrazione pagamento: rifiuta le mensilità sospese
-- ============================================================
-- Rispetto alla 20260610b cambia solo la guardia su is_suspended.
CREATE OR REPLACE FUNCTION toggle_payment_paid(
  p_payment_id UUID,
  p_performed_by UUID,
  p_paid_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (id UUID, is_paid BOOLEAN, paid_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment client_payments%ROWTYPE;
  v_client_id UUID;
  v_new_paid BOOLEAN;
  v_new_paid_at TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori';
  END IF;

  SELECT * INTO v_payment FROM client_payments WHERE client_payments.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento non trovato'; END IF;

  IF v_payment.is_suspended THEN
    RAISE EXCEPTION 'Mensilità sospesa: riattivala prima di registrare il pagamento';
  END IF;

  SELECT client_id INTO v_client_id FROM client_contracts WHERE client_contracts.id = v_payment.contract_id;

  v_new_paid := NOT v_payment.is_paid;
  v_new_paid_at := CASE WHEN v_new_paid THEN COALESCE(p_paid_at, now()) ELSE NULL END;

  UPDATE client_payments SET is_paid = v_new_paid, paid_at = v_new_paid_at
  WHERE client_payments.id = p_payment_id;

  INSERT INTO payment_logs (payment_id, contract_id, client_id, action, amount,
                            month_index, due_date, performed_by)
  VALUES (p_payment_id, v_payment.contract_id, v_client_id,
          CASE WHEN v_new_paid THEN 'paid' ELSE 'unpaid' END,
          v_payment.amount, v_payment.month_index, v_payment.due_date, p_performed_by);

  RETURN QUERY SELECT p_payment_id, v_new_paid, v_new_paid_at;
END;
$$;

-- ============================================================
-- 6. Rendicontazione: le mensilità sospese non esistono
-- ============================================================
-- Una rata sospesa non è né incassata né da incassare: va esclusa ovunque,
-- altrimenti resta a bilancio come credito che non arriverà mai.

-- Scheda cliente. total_value resta monthly_fee * duration_months: la coda
-- assorbe la sospensione, quindi il valore del contratto non cambia.
CREATE OR REPLACE FUNCTION get_client_financial_summary(p_client_id UUID)
RETURNS TABLE (
  contract_id UUID,
  monthly_fee NUMERIC,
  duration_months INTEGER,
  start_date DATE,
  contract_status contract_status,
  total_value NUMERIC,
  total_paid NUMERIC,
  remaining NUMERIC,
  months_paid BIGINT,
  months_remaining BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.monthly_fee,
    cc.duration_months,
    cc.start_date,
    cc.status,
    (cc.monthly_fee * cc.duration_months),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true AND cp.is_suspended = false), 0),
    (cc.monthly_fee * cc.duration_months) - COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true AND cp.is_suspended = false), 0),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = true AND cp.is_suspended = false),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = false AND cp.is_suspended = false)
  FROM client_contracts cc
  LEFT JOIN client_payments cp ON cp.contract_id = cc.id
  WHERE cc.client_id = p_client_id
    AND cc.status = 'active'
  GROUP BY cc.id, cc.monthly_fee, cc.duration_months, cc.start_date, cc.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
