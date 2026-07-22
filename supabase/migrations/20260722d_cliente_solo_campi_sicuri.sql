-- ============================================================
-- Il cliente del portale NON legge le note interne su di sé
-- ============================================================
--
-- La 20260721j dava al cliente la lettura della propria riga clients, per
-- mostrargli nome e logo nel portale. Ma concede la RIGA intera: con il
-- proprio token e select=* il cliente puo' leggersi la colonna `notes` — i
-- giudizi interni che il team scrive su di lui ("paga in ritardo", "difficile
-- da gestire") — e i propri dati fiscali. La RLS lavora per riga, non per
-- colonna: non si puo' concedere solo name e logo.
--
-- Il portale usa solo tre campi (name, company, logo_url). Li si serve con una
-- funzione che restituisce ESATTAMENTE quelli, e si toglie l'accesso diretto
-- alla tabella. Stesso principio di tutte le altre letture del portale.
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_mio_cliente()
RETURNS TABLE(id uuid, name text, company text, logo_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.company, c.logo_url
  FROM clients c
  WHERE c.id = public.current_client_id();
$$;

REVOKE ALL ON FUNCTION public.portal_mio_cliente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_mio_cliente() TO authenticated;

-- Via l'accesso diretto: da qui il cliente non legge piu' nessuna colonna di
-- clients, note e dati fiscali compresi. Il team continua a leggerla con la
-- propria policy is_staff().
DROP POLICY IF EXISTS "Il cliente vede il proprio cliente" ON clients;


-- ============================================================
-- Verifica
-- ============================================================
SELECT
  CASE WHEN to_regprocedure('public.portal_mio_cliente()') IS NOT NULL
       THEN 'ok' ELSE 'MANCA' END AS funzione,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'clients'
     AND policyname = 'Il cliente vede il proprio cliente') AS policy_da_rimuovere_deve_essere_0;

NOTIFY pgrst, 'reload schema';
