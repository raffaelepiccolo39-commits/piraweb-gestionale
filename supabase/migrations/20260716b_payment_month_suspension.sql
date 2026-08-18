-- Sospensione mensilità (cliente fermo per uno o più mesi).
--
-- Prima di questa migration l'unico strumento era clients.paused_at, che esclude
-- il cliente dalla rendicontazione ma non tocca le rate: le mensilità restavano
-- dovute, diventavano rosse "Pagamento in ritardo!" e alla riattivazione il
-- contratto scadeva comunque alla data originale. L'unica via d'uscita era il
-- rinnovo, che chiude il contratto e rigenera le rate da zero.
--
-- Modello: le righe di client_payments diventano SLOT DI CALENDARIO contigui
-- (month_index 0,1,2,... = start_date + N mesi). Una riga sospesa resta al suo
-- posto nel calendario ma non è dovuta, e la coda del contratto si allunga di
-- un mese per compensare: le mensilità dovute (is_suspended = false) restano
-- sempre pari a duration_months, quindi il Valore Contratto non cambia e il
-- cliente riceve comunque tutti i mesi di lavoro pattuiti.
--
--   Contratto 6 mesi Apr→Set, Agosto sospeso:
--     slot 0 Apr  dovuta (mese 1)      slot 4 Ago  SOSPESA
--     slot 1 Mag  dovuta (mese 2)      slot 5 Set  dovuta (mese 5)
--     slot 2 Giu  dovuta (mese 3)      slot 6 Ott  dovuta (mese 6)  ← aggiunta in coda
--     slot 3 Lug  dovuta (mese 4)
--
-- "MESE N" non è più month_index + 1: è la posizione fra le sole mensilità
-- dovute, calcolata lato UI. Sui contratti senza sospensioni i due valori
-- coincidono, quindi niente cambia per i dati esistenti.
--
-- La sospensione è indipendente da clients.paused_at: sono due leve separate.

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

-- Cashflow: identiche alla 20260630d, + AND cp.is_suspended = false
CREATE OR REPLACE FUNCTION get_cashflow_summary(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  active_contracts BIGINT,
  active_clients BIGINT,
  avg_monthly_revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND c.paused_at IS NULL AND cp.is_suspended = false
    ), 0) AS total_expected,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = true AND c.paused_at IS NULL AND cp.is_suspended = false
    ), 0) AS total_received,
    COALESCE((
      SELECT SUM(cp.amount)
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND cp.is_paid = false AND c.paused_at IS NULL AND cp.is_suspended = false
    ), 0) AS total_pending,
    (SELECT COUNT(*) FROM client_contracts cc JOIN clients c ON c.id = cc.client_id WHERE cc.status = 'active' AND c.paused_at IS NULL) AS active_contracts,
    (SELECT COUNT(DISTINCT cc.client_id) FROM client_contracts cc JOIN clients c ON c.id = cc.client_id WHERE cc.status = 'active' AND c.paused_at IS NULL) AS active_clients,
    COALESCE((
      SELECT CASE
        WHEN COUNT(DISTINCT date_trunc('month', cp.due_date)) = 0 THEN 0
        ELSE ROUND(SUM(cp.amount) FILTER (WHERE cp.is_paid = true) / COUNT(DISTINCT date_trunc('month', cp.due_date)), 2)
      END
      FROM client_payments cp
      JOIN client_contracts cc ON cc.id = cp.contract_id
      JOIN clients c ON c.id = cc.client_id
      WHERE cp.due_date >= p_start_date AND cp.due_date <= p_end_date AND cc.status = 'active' AND c.paused_at IS NULL AND cp.is_suspended = false
    ), 0) AS avg_monthly_revenue;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Identica alla 20260706b, + AND cp.is_suspended = false
CREATE OR REPLACE FUNCTION get_cashflow_monthly(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  month_date DATE,
  expected NUMERIC,
  received NUMERIC,
  pending NUMERIC,
  num_clients BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('month', cp.due_date)::DATE AS md,
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    COUNT(DISTINCT cc.client_id)
  FROM client_payments cp
  JOIN client_contracts cc ON cc.id = cp.contract_id
  JOIN clients c ON c.id = cc.client_id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active'
    AND c.paused_at IS NULL
    AND cp.is_suspended = false
  GROUP BY md
  ORDER BY md;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Identica alla 20260630d, + AND cp.is_suspended = false
CREATE OR REPLACE FUNCTION get_revenue_per_client(
  p_start_date DATE DEFAULT (date_trunc('year', now()))::DATE,
  p_end_date DATE DEFAULT (now())::DATE
)
RETURNS TABLE (
  client_id UUID,
  client_name TEXT,
  company TEXT,
  monthly_fee NUMERIC,
  total_expected NUMERIC,
  total_paid NUMERIC,
  total_pending NUMERIC,
  months_paid BIGINT,
  months_total BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.company,
    cc.monthly_fee,
    COALESCE(SUM(cp.amount), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0),
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0),
    COUNT(cp.id) FILTER (WHERE cp.is_paid = true),
    COUNT(cp.id)
  FROM clients c
  JOIN client_contracts cc ON cc.client_id = c.id AND cc.status = 'active'
  JOIN client_payments cp ON cp.contract_id = cc.id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND c.paused_at IS NULL
    AND cp.is_suspended = false
  GROUP BY c.id, c.name, c.company, cc.monthly_fee
  ORDER BY COALESCE(SUM(cp.amount), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
