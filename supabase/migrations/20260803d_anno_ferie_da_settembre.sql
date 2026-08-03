-- Le ferie si azzerano ogni 1° settembre.
--
-- Regola decisa il 2026-08-03: dal 1° settembre il conteggio riparte da zero
-- per tutti, poi si maturano 2 giorni al mese fino a un massimo di 24.
-- Dodici mesi per due giorni fa esattamente 24: l'anno di ferie va da
-- settembre ad agosto, e a fine agosto quello che non si e' preso non passa
-- all'anno dopo.
--
-- Cosa cambia davvero: i 2 giorni al mese e il tetto di 24 c'erano gia'. Cio'
-- che mancava e' il punto di ripartenza — si contava dal 2026-06-01 in avanti
-- e basta, quindi il saldo cresceva all'infinito fino al tetto e i giorni
-- goduti restavano sottratti per sempre.
--
-- Nota sul perche' non si azzera nulla "a mano": non c'e' nessun campo da
-- resettare. Maturati e goduti sono CALCOLATI a ogni lettura, quindi basta
-- spostare la data da cui si contano — e l'azzeramento succede da se' allo
-- scoccare del 1° settembre, ogni anno, senza che nessuno debba ricordarsene.

-- ── Da quando si conta ──────────────────────────────────────
--
-- L'ultimo 1° settembre passato. Da settembre a dicembre e' quello di
-- quest'anno; da gennaio ad agosto e' quello dell'anno scorso.
CREATE OR REPLACE FUNCTION public.inizio_anno_ferie(p_data date DEFAULT CURRENT_DATE)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_data) >= 9
      THEN make_date(EXTRACT(YEAR FROM p_data)::int, 9, 1)
    ELSE make_date(EXTRACT(YEAR FROM p_data)::int - 1, 9, 1)
  END;
$$;

-- ── Maturati ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accrued_vacation_days(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_contract_start date;
  v_effective_start date;
  v_inizio_periodo date;
  v_months integer;
  v_bonus numeric;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT ec.contract_start_date, COALESCE(p.vacation_bonus_days, 0)
    INTO v_contract_start, v_bonus
    FROM profiles p
    LEFT JOIN employee_compensation ec ON ec.profile_id = p.id
    WHERE p.id = p_user_id;

  -- Il periodo in corso. Il 2026-06-01 resta come pavimento: e' la data da
  -- cui il gestionale ha iniziato a contare, e prima di quella non ci sono
  -- dati. Da settembre 2026 in poi vince sempre il 1° settembre.
  v_inizio_periodo := GREATEST(DATE '2026-06-01', public.inizio_anno_ferie(v_today));

  IF v_contract_start IS NULL THEN RETURN LEAST(COALESCE(v_bonus, 0), 24); END IF;

  -- Chi e' stato assunto a periodo iniziato matura dal suo primo giorno, non
  -- da settembre: due mesi di lavoro sono due mesi di ferie, non dodici.
  v_effective_start := GREATEST(v_contract_start, v_inizio_periodo);
  IF v_effective_start > v_today THEN RETURN LEAST(COALESCE(v_bonus, 0), 24); END IF;

  v_months := (EXTRACT(YEAR FROM v_today) - EXTRACT(YEAR FROM v_effective_start))::int * 12
            + (EXTRACT(MONTH FROM v_today) - EXTRACT(MONTH FROM v_effective_start))::int;
  IF EXTRACT(DAY FROM v_today) < EXTRACT(DAY FROM v_effective_start) THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN v_months := 0; END IF;

  RETURN LEAST((v_months * 2)::numeric + COALESCE(v_bonus, 0), 24);
END;
$fn$;

-- ── Goduti ──────────────────────────────────────────────────
--
-- Solo quelli dentro il periodo in corso: senza questo, le ferie prese a
-- luglio continuerebbero a essere sottratte anche a settembre, e
-- l'azzeramento sarebbe finto.
CREATE OR REPLACE FUNCTION public.used_vacation_days(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(total_days), 0)::numeric
  FROM time_off_requests
  WHERE user_id = p_user_id
    AND type = 'ferie'
    AND status = 'approved'
    AND start_date >= GREATEST(DATE '2026-06-01', public.inizio_anno_ferie());
$$;
