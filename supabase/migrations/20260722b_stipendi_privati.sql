-- ============================================================
-- Gli stipendi diventano davvero riservati (fase 1: espandi)
-- ============================================================
--
-- Verificato con un token di dipendente vero: OGNI membro del team leggeva
-- lo stipendio, l'IBAN e i dati contrattuali di tutti gli altri. Le colonne
-- salary/iban/contract stanno in `profiles`, che tutta l'app legge per nomi,
-- ruoli e colori — e la sua policy di lettura e' aperta a chiunque sia
-- loggato. La RLS lavora per RIGA, non per colonna: finche' quei dati stanno
-- lì, chiunque veda la riga li vede tutti.
--
-- La soluzione e' spostarli in una tabella a parte, leggibile solo dal
-- diretto interessato e dall'admin.
--
-- Questa e' la FASE 1 e non rompe niente: crea la tabella nuova, ci copia i
-- dati, ma LASCIA le colonne in profiles dov'erano. Cosi' il vecchio codice
-- continua a funzionare mentre si aggiorna quello nuovo. Le colonne in
-- profiles si eliminano nella fase 2 (20260722c), da lanciare SOLO dopo che
-- il codice nuovo e' online e verificato. Fino ad allora il buco resta, ma e'
-- una lettura fra 5 persone di cui ci si fida — non un'esposizione esterna.
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_compensation (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  salary numeric,
  iban text,
  contract_type employee_contract_type,
  contract_start_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Copia i dati esistenti. ON CONFLICT per poterla rilanciare senza duplicare.
INSERT INTO employee_compensation (profile_id, salary, iban, contract_type, contract_start_date)
SELECT id, salary, iban, contract_type, contract_start_date
FROM profiles
ON CONFLICT (profile_id) DO NOTHING;

ALTER TABLE employee_compensation ENABLE ROW LEVEL SECURITY;

-- Lo vede il diretto interessato (il proprio stipendio si puo' guardare) e
-- l'admin (che gestisce le buste paga). Nessun altro.
DROP POLICY IF EXISTS "Ognuno vede la propria retribuzione" ON employee_compensation;
CREATE POLICY "Ognuno vede la propria retribuzione" ON employee_compensation
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

-- La scrittura e' solo dell'admin: nessuno si alza lo stipendio da solo.
-- Le route server (create-user, update-member) usano il service role, che
-- scavalca comunque la RLS: questa policy protegge dalle scritture dirette.
DROP POLICY IF EXISTS "Solo l'admin scrive la retribuzione" ON employee_compensation;
CREATE POLICY "Solo l'admin scrive la retribuzione" ON employee_compensation
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- L'IBAN, però, il dipendente lo mette da sé
-- ============================================================
-- Nella pagina Profilo ognuno inserisce le proprie coordinate bancarie. Non
-- puo' toccare lo stipendio (quello lo scrive l'admin), ma l'IBAN e' suo.
-- Una funzione dedicata che tocca SOLO l'iban, SOLO della propria riga.

CREATE OR REPLACE FUNCTION public.aggiorna_mio_iban(p_iban text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;

  INSERT INTO employee_compensation (profile_id, iban)
  VALUES (auth.uid(), nullif(btrim(coalesce(p_iban, '')), ''))
  ON CONFLICT (profile_id)
  DO UPDATE SET iban = nullif(btrim(coalesce(p_iban, '')), ''), updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.aggiorna_mio_iban(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggiorna_mio_iban(text) TO authenticated;


-- ============================================================
-- Tiene allineata la copia in profiles finché non si eliminano le colonne
-- ============================================================
-- Durante la transizione qualcuno potrebbe ancora scrivere su profiles col
-- vecchio codice: questo trigger ribalta la modifica anche sulla tabella
-- nuova, cosi' le due non divergono. Sparira' con le colonne, nella fase 2.

CREATE OR REPLACE FUNCTION public.sync_compensation_da_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO employee_compensation (profile_id, salary, iban, contract_type, contract_start_date)
  VALUES (NEW.id, NEW.salary, NEW.iban, NEW.contract_type, NEW.contract_start_date)
  ON CONFLICT (profile_id) DO UPDATE SET
    salary = EXCLUDED.salary,
    iban = EXCLUDED.iban,
    contract_type = EXCLUDED.contract_type,
    contract_start_date = EXCLUDED.contract_start_date,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_compensation ON profiles;
CREATE TRIGGER sync_compensation
  AFTER INSERT OR UPDATE OF salary, iban, contract_type, contract_start_date ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_compensation_da_profiles();


-- ============================================================
-- Verifica
-- ============================================================
-- I numeri devono coincidere con quelli in profiles.
SELECT
  (SELECT count(*) FROM employee_compensation) AS righe_copiate,
  (SELECT count(*) FROM profiles WHERE salary IS NOT NULL) AS profili_con_stipendio;

NOTIFY pgrst, 'reload schema';
