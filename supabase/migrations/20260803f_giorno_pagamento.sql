-- Il giorno di pagamento, quando non e' ne' il primo ne' l'ultimo.
--
-- Il modello prevedeva due sole possibilita': inizio mese o fine mese. Ma i
-- contratti veri non stanno sempre dentro due caselle — il Notaio D'Ausilio
-- paga il 24, e nessuna delle due lo descrive. Finora quel contratto era
-- registrato come "inizio mese" e il gestionale lo sollecitava dal primo:
-- ventitre giorni prima del dovuto.
--
-- Si aggiunge quindi un giorno preciso, facoltativo. Quando c'e', comanda
-- lui; quando manca, si continua con inizio/fine mese come prima. Non si
-- tocca `payment_timing`, cosi' i contratti gia' inseriti restano validi e
-- l'etichetta nella scheda cliente continua a funzionare.

ALTER TABLE client_contracts
  ADD COLUMN IF NOT EXISTS payment_day SMALLINT;

ALTER TABLE client_contracts
  DROP CONSTRAINT IF EXISTS client_contracts_payment_day_valido;
ALTER TABLE client_contracts
  ADD CONSTRAINT client_contracts_payment_day_valido
  CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31);

-- ── Come si calcola una scadenza, ora ───────────────────────
--
-- Il giorno preciso vince su inizio/fine mese. Se il mese e' piu' corto del
-- giorno richiesto (il 31 a febbraio, il 31 ad aprile) si scala all'ultimo
-- giorno disponibile: e' quello che succede anche nella realta', nessuno
-- paga il 31 novembre.
CREATE OR REPLACE FUNCTION public.scadenza_del_mese(
  p_mese date,
  p_timing payment_timing,
  p_giorno smallint DEFAULT NULL
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_giorno IS NOT NULL THEN
      LEAST(
        make_date(EXTRACT(YEAR FROM p_mese)::int, EXTRACT(MONTH FROM p_mese)::int, p_giorno::int),
        (date_trunc('month', p_mese) + INTERVAL '1 month - 1 day')::date
      )
    WHEN p_timing = 'fine_mese'
      THEN (date_trunc('month', p_mese) + INTERVAL '1 month - 1 day')::date
    ELSE date_trunc('month', p_mese)::date
  END;
$$;

-- Il giorno 31 e' l'ultimo del mese, non "il 31 quando esiste": chiedere il
-- 31 e ottenere il 30 ad aprile e' esattamente il comportamento voluto, ed e'
-- quello che LEAST garantisce sopra. Quindi make_date non deve mai ricevere
-- un giorno impossibile: si costruisce sul primo del mese e si limita.
CREATE OR REPLACE FUNCTION public.scadenza_del_mese(p_mese date, p_timing payment_timing)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.scadenza_del_mese(p_mese, p_timing, NULL::smallint);
$$;

-- ── Generazione delle scadenze ──────────────────────────────
CREATE OR REPLACE FUNCTION generate_contract_payments(p_contract_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract RECORD;
BEGIN
  SELECT * INTO v_contract FROM client_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  DELETE FROM client_payments WHERE contract_id = p_contract_id;

  INSERT INTO client_payments (contract_id, month_index, due_date, amount)
  SELECT
    p_contract_id,
    i,
    public.scadenza_del_mese(
      (v_contract.start_date + (i || ' months')::INTERVAL)::date,
      v_contract.payment_timing,
      v_contract.payment_day
    ),
    v_contract.monthly_fee
  FROM generate_series(0, v_contract.duration_months - 1) AS i;
END;
$$;

-- ── I contratti veri, come pattuito col cliente ─────────────
-- (dati riferiti da Raffaele il 2026-08-03)

-- Notaio D'Ausilio: paga il 24, non il primo.
UPDATE client_contracts cc
   SET payment_day = 24
  FROM clients c
 WHERE c.id = cc.client_id
   AND cc.status = 'active'
   AND (c.company ILIKE '%ausilio%' OR c.name ILIKE '%ausilio%');

-- Pasticceria Blue Moon: paga a fine mese, era registrata a inizio.
UPDATE client_contracts cc
   SET payment_timing = 'fine_mese'
  FROM clients c
 WHERE c.id = cc.client_id
   AND cc.status = 'active'
   AND (c.company ILIKE '%blue moon%' OR c.name ILIKE '%blue moon%');

-- ── Riallineamento delle scadenze non pagate ────────────────
-- Come prima: si sposta solo cio' che non e' ancora stato incassato.
UPDATE client_payments cp
   SET due_date = public.scadenza_del_mese(cp.due_date, cc.payment_timing, cc.payment_day)
  FROM client_contracts cc
 WHERE cc.id = cp.contract_id
   AND cp.is_paid = false
   AND cp.due_date <> public.scadenza_del_mese(cp.due_date, cc.payment_timing, cc.payment_day);

NOTIFY pgrst, 'reload schema';

-- ── Il rinnovo deve poter portarsi dietro il giorno ─────────
-- Il rinnovo passa da una funzione con la firma fissa: senza aggiungere il
-- parametro, rinnovare un contratto col giorno preciso lo perderebbe per
-- strada, e le scadenze tornerebbero al primo del mese.
DROP FUNCTION IF EXISTS renew_client_contract(uuid, uuid, numeric, integer, date, text, text, text, text, uuid);

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
  p_created_by UUID,
  p_payment_day SMALLINT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  UPDATE client_contracts SET status = 'completed', updated_at = now()
   WHERE id = p_old_contract_id;

  INSERT INTO client_contracts (
    client_id, monthly_fee, duration_months, start_date,
    payment_timing, payment_day, attachment_url, attachment_name, notes, created_by
  ) VALUES (
    p_client_id, p_monthly_fee, p_duration_months, p_start_date,
    p_payment_timing::payment_timing, p_payment_day, p_attachment_url, p_attachment_name,
    p_notes, p_created_by
  )
  RETURNING id INTO v_new_id;

  PERFORM generate_contract_payments(v_new_id);

  RETURN v_new_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
