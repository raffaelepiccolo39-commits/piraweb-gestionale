-- ============================================================
-- La seconda classe di policy permissive: "sono io il proprietario"
-- ============================================================
--
-- L'irrigidimento della 20260720b cercava le policy scritte LETTERALMENTE
-- `true`. Ne restava fuori un'intera famiglia, scritta così:
--
--     FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid())
--
-- che sembra un controllo ma non lo è: chiunque sia autenticato la
-- soddisfa, semplicemente mettendo sé stesso come autore. Finché gli unici
-- account erano i cinque dipendenti andava bene. Con i clienti del portale
-- no: non potrebbero RILEGGERE quelle righe (la lettura è già ristretta a
-- is_staff), ma potrebbero INSERIRLE — task inventate, post in bacheca,
-- richieste di ferie, note spese, feedback tra colleghi, trattative.
--
-- Trovata correggendo /api/calendar/events, dove la policy diceva
-- created_by = auth.uid() ed era quindi sfuggita al giro precedente.
--
-- Qui NON si sostituisce la condizione: le si mette davanti is_staff(),
-- conservando l'originale. Per il team non cambia nulla.
--
-- ESCLUSA `profiles`: la sua policy (auth.uid() = id) serve a creare il
-- proprio profilo, ed è ciò che rende qualcuno "staff". Aggiungerci
-- is_staff() sarebbe circolare — nessuno potrebbe più diventare del team.
--
-- Come sempre lo script legge pg_policies, cioè lo stato reale del
-- database, e non i nomi che stanno nel repo.
-- ============================================================

DO $$
DECLARE
  p RECORD;
  n int := 0;
BEGIN
  FOR p IN
    SELECT tablename, policyname, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'INSERT'
      AND array_to_string(roles, ',') = 'authenticated'
      AND tablename <> 'profiles'                 -- vedi nota sopra
      AND with_check IS NOT NULL
      AND with_check LIKE '%auth.uid()%'
      -- solo le policy che NON hanno già un controllo vero
      AND with_check NOT LIKE '%is_staff%'
      AND with_check NOT LIKE '%is_admin%'
      AND with_check NOT LIKE '%current_client_id%'
      AND with_check NOT LIKE '%EXISTS%'
      AND with_check NOT LIKE '% OR %'
    ORDER BY tablename, policyname
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I WITH CHECK (public.is_staff() AND (%s))',
      p.policyname, p.tablename, p.with_check
    );
    n := n + 1;
    RAISE NOTICE 'ora richiede is_staff(): %.%', p.tablename, p.policyname;
  END LOOP;

  RAISE NOTICE '--- Policy INSERT ristrette: % ---', n;
END $$;


-- ============================================================
-- Verifica
-- ============================================================
-- Deve restituire SOLO la riga di `profiles`: è l'unica che resta
-- volutamente aperta a chi non è ancora del team.
SELECT tablename, policyname, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'INSERT'
  AND array_to_string(roles, ',') = 'authenticated'
  AND with_check IS NOT NULL
  AND with_check LIKE '%auth.uid()%'
  AND with_check NOT LIKE '%is_staff%'
  AND with_check NOT LIKE '%is_admin%'
  AND with_check NOT LIKE '%current_client_id%'
  AND with_check NOT LIKE '%EXISTS%'
  AND with_check NOT LIKE '% OR %'
ORDER BY tablename;
