-- ============================================================
-- Prerequisito del portale clienti: separare "team" da "autenticato"
-- ============================================================
--
-- Molte policy del gestionale dicono "TO authenticated USING (true)":
-- chiunque sia loggato può leggere tutto. Era una scorciatoia ragionevole
-- finché gli unici account erano i 5 dipendenti. Dal momento in cui un
-- cliente avrà un login, erediterebbe quegli stessi permessi: elenco
-- clienti, task, progetti, pipeline commerciale (deals), riunioni.
--
-- Qui introduciamo public.is_staff() = "questo utente ha una riga in
-- profiles", e restringiamo a quello ogni policy permissiva.
--
-- Per il team NON cambia nulla: tutti hanno una riga in profiles, quindi
-- vedono esattamente quello che vedevano prima. Cambia solo per chi è
-- autenticato ma non è del team — cioè i futuri utenti del portale, che
-- staranno FUORI da profiles, in una tabella dedicata.
--
-- Verificato prima di scrivere: gli utenti ANONIMI non leggono nulla
-- (RLS restituisce [] con la chiave anon), quindi il problema riguarda
-- solo gli autenticati.
--
-- Lo script NON elenca le policy a mano: le trova da pg_policies, cioè
-- dallo stato REALE del database, non da quello che c'è nel repo (che
-- oggi abbiamo visto poter divergere). È ripetibile: una policy già
-- ristretta non viene più trovata dalla query.
-- ============================================================


-- ============================================================
-- 1. L'helper
-- ============================================================
-- SECURITY DEFINER come is_admin(): deve poter leggere profiles
-- scavalcando la RLS di profiles, altrimenti si avvita su sé stesso.

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (select auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

COMMENT ON FUNCTION public.is_staff() IS
  'true se l''utente autenticato è un membro del team (ha una riga in profiles). I clienti del portale non ce l''hanno.';


-- ============================================================
-- 2. Restringe le policy permissive
-- ============================================================
-- Tocca SOLO le policy concesse esattamente al ruolo "authenticated":
-- quelle per "public"/"anon" (form pubblici, prenotazioni) restano
-- intatte, così non si rompe niente di ciò che deve stare aperto.

DO $$
DECLARE
  p RECORD;
  n int := 0;
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND array_to_string(roles, ',') = 'authenticated'
      AND (
        btrim(coalesce(qual, ''))       IN ('true', '(true)')
        OR btrim(coalesce(with_check, '')) IN ('true', '(true)')
      )
    ORDER BY tablename, policyname
  LOOP
    IF p.cmd = 'INSERT' THEN
      -- Le policy INSERT hanno solo WITH CHECK, mai USING.
      EXECUTE format(
        'ALTER POLICY %I ON public.%I WITH CHECK (public.is_staff())',
        p.policyname, p.tablename);

    ELSIF btrim(coalesce(p.qual, '')) IN ('true', '(true)')
      AND btrim(coalesce(p.with_check, '')) IN ('true', '(true)') THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (public.is_staff()) WITH CHECK (public.is_staff())',
        p.policyname, p.tablename);

    ELSIF btrim(coalesce(p.qual, '')) IN ('true', '(true)') THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (public.is_staff())',
        p.policyname, p.tablename);

    ELSE
      EXECUTE format(
        'ALTER POLICY %I ON public.%I WITH CHECK (public.is_staff())',
        p.policyname, p.tablename);
    END IF;

    n := n + 1;
    RAISE NOTICE 'ristretta a is_staff(): %.%  [%]', p.tablename, p.policyname, p.cmd;
  END LOOP;

  RAISE NOTICE '--- Policy ristrette in totale: % ---', n;
END $$;


-- ============================================================
-- 3. Verifica
-- ============================================================
-- Deve restituire ZERO righe: nessuna policy per "authenticated"
-- lascia più passare tutti. Se ne resta qualcuna, va guardata a mano.

SELECT tablename, policyname, cmd,
       coalesce(qual, '-') AS using_expr,
       coalesce(with_check, '-') AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND array_to_string(roles, ',') = 'authenticated'
  AND (
    btrim(coalesce(qual, ''))          IN ('true', '(true)')
    OR btrim(coalesce(with_check, '')) IN ('true', '(true)')
  )
ORDER BY tablename;


-- ============================================================
-- Se qualcosa va storto
-- ============================================================
-- Per riaprire una singola policy mentre si indaga:
--   ALTER POLICY "<nome>" ON public.<tabella> USING (true);
-- (o WITH CHECK (true) se è una INSERT).
--
-- DOPO l'esecuzione va provata l'app con un account NON admin: il team
-- deve continuare a vedere task, progetti, clienti e bacheca come prima.
-- Build e typecheck qui non servono a niente: è tutta roba di database.
-- ============================================================
