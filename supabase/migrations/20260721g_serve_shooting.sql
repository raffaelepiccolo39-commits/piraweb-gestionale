-- ============================================================
-- "Quando finisce il mio piano editoriale?" — la data, non la tabella
-- ============================================================
--
-- Serve a due cose nella home del cliente: far comparire la scorciatoia
-- Shooting solo quando ha senso, e mostrare l'avviso di scadenza con la
-- data vera ("il piano finisce il 5 agosto"), non un generico "in
-- scadenza" che non dice quanto tempo resta.
--
-- Il dato sta in client_ped_coverage, che il cliente NON puo leggere — e
-- non deve: contiene la pianificazione di tutti i clienti. Quindi non si
-- apre la tabella, si espone una funzione che risponde per il proprio.
-- ============================================================

DROP FUNCTION IF EXISTS public.portal_serve_shooting();

CREATE OR REPLACE FUNCTION public.portal_scadenza_piano()
RETURNS date
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT covered_until
  FROM client_ped_coverage
  WHERE client_id = public.current_client_id()
    AND covered_until IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.portal_scadenza_piano() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_scadenza_piano() TO authenticated;

COMMENT ON FUNCTION public.portal_scadenza_piano() IS
  'Fino a quando è coperto il piano editoriale del cliente collegato. NULL se non impostato.';

NOTIFY pgrst, 'reload schema';
