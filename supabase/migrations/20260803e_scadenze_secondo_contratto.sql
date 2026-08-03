-- Le scadenze seguono davvero il contratto: inizio o fine mese.
--
-- `payment_timing` esisteva gia' ed era compilato ("inizio_mese" su 8
-- contratti, "fine_mese" su 3), ma serviva solo a scrivere un'etichetta nella
-- scheda cliente: chi generava le scadenze faceva `start_date + i mesi` e non
-- lo guardava. Risultato, verificato il 2026-08-03:
--
--   Con.Tex Biancheria   fine_mese, iniziato il 08/04  → scadenze l'8 del mese
--   Pedata Biancheria    fine_mese, iniziato il 08/04  → scadenze l'8 del mese
--   Centro medico Alcaia fine_mese, iniziato il 01/04  → scadenze il 1° del mese
--
-- Cioe' tre clienti su cui il gestionale sollecitava (e contava il cashflow)
-- con tre settimane di anticipo rispetto a quanto pattuito.

-- ── 1. Come si calcola una scadenza ─────────────────────────
CREATE OR REPLACE FUNCTION public.scadenza_del_mese(p_mese date, p_timing payment_timing)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_timing = 'fine_mese'
      -- Ultimo giorno: primo del mese dopo, meno un giorno. Vale anche per
      -- febbraio e per i bisestili, senza doverli trattare a parte.
      THEN (date_trunc('month', p_mese) + INTERVAL '1 month - 1 day')::date
    ELSE date_trunc('month', p_mese)::date
  END;
$$;

-- ── 2. La generazione delle scadenze ────────────────────────
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
      v_contract.payment_timing
    ),
    v_contract.monthly_fee
  FROM generate_series(0, v_contract.duration_months - 1) AS i;
END;
$$;

-- ── 3. I contratti che ci sono gia' ─────────────────────────
--
-- Non si rigenera con la funzione: quella cancella e ricrea, e con le righe
-- se ne andrebbero anche gli incassi gia' segnati. Si spostano solo le
-- scadenze NON ancora pagate — il passato resta com'e' successo, perche' una
-- data d'incasso e' un fatto, non una previsione.

UPDATE client_payments cp
   SET due_date = public.scadenza_del_mese(cp.due_date, cc.payment_timing)
  FROM client_contracts cc
 WHERE cc.id = cp.contract_id
   AND cp.is_paid = false
   AND cp.due_date <> public.scadenza_del_mese(cp.due_date, cc.payment_timing);
