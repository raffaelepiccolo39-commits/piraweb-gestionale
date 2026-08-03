-- Contratti a progetto: acconto e saldo, non un canone mensile.
--
-- Finora un contratto era per forza un canone che si ripete: importo mensile
-- per numero di mesi. Ma un lavoro una tantum — un sito, un rebranding, uno
-- shooting — si paga con un acconto alla firma e il saldo alla consegna, e
-- per registrarlo bisognava inventare un canone che non esiste.
--
-- Si aggiunge quindi un tipo. Quelli che ci sono restano "mensile" senza che
-- nessuno tocchi niente: il valore predefinito li copre tutti.

ALTER TABLE client_contracts
  ADD COLUMN IF NOT EXISTS tipo_contratto TEXT NOT NULL DEFAULT 'mensile',
  ADD COLUMN IF NOT EXISTS importo_totale NUMERIC,
  ADD COLUMN IF NOT EXISTS acconto NUMERIC,
  ADD COLUMN IF NOT EXISTS data_saldo DATE;

ALTER TABLE client_contracts
  DROP CONSTRAINT IF EXISTS client_contracts_tipo_valido;
ALTER TABLE client_contracts
  ADD CONSTRAINT client_contracts_tipo_valido
  CHECK (tipo_contratto IN ('mensile', 'progetto'));

-- L'acconto non puo' superare il totale: sarebbe un saldo negativo, cioe' un
-- rimborso, che e' un'altra cosa e va registrata diversamente.
ALTER TABLE client_contracts
  DROP CONSTRAINT IF EXISTS client_contracts_acconto_valido;
ALTER TABLE client_contracts
  ADD CONSTRAINT client_contracts_acconto_valido
  CHECK (
    tipo_contratto <> 'progetto'
    OR acconto IS NULL
    OR importo_totale IS NULL
    OR acconto <= importo_totale
  );

-- ── Le scadenze di un progetto ──────────────────────────────
--
-- Due righe invece di dodici: l'acconto alla data d'inizio, il saldo alla
-- data concordata. Se l'acconto non c'e' (o e' zero) resta una riga sola col
-- totale, che e' il caso "si paga tutto alla consegna".
--
-- Restano righe di `client_payments` come le rate mensili: cosi' cashflow,
-- solleciti e portale cliente continuano a funzionare senza sapere che
-- esistono due tipi di contratto.
CREATE OR REPLACE FUNCTION generate_contract_payments(p_contract_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract RECORD;
  v_acconto NUMERIC;
  v_saldo NUMERIC;
BEGIN
  SELECT * INTO v_contract FROM client_contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;

  DELETE FROM client_payments WHERE contract_id = p_contract_id;

  IF v_contract.tipo_contratto = 'progetto' THEN
    v_acconto := COALESCE(v_contract.acconto, 0);
    v_saldo := COALESCE(v_contract.importo_totale, 0) - v_acconto;

    IF v_acconto > 0 THEN
      INSERT INTO client_payments (contract_id, month_index, due_date, amount, notes)
      VALUES (p_contract_id, 0, v_contract.start_date, v_acconto, 'Acconto');
    END IF;

    IF v_saldo > 0 THEN
      INSERT INTO client_payments (contract_id, month_index, due_date, amount, notes)
      VALUES (
        p_contract_id,
        CASE WHEN v_acconto > 0 THEN 1 ELSE 0 END,
        COALESCE(v_contract.data_saldo, v_contract.start_date + INTERVAL '1 month')::date,
        v_saldo,
        CASE WHEN v_acconto > 0 THEN 'Saldo' ELSE 'Pagamento unico' END
      );
    END IF;

    RETURN;
  END IF;

  -- Contratto mensile: come prima, con la scadenza che segue il contratto.
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

NOTIFY pgrst, 'reload schema';
