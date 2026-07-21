-- ============================================================
-- Mese di riferimento e "approva tutto il mese"
-- ============================================================
--
-- Un piano editoriale è una cosa mensile: si prepara il mese, lo si fa
-- vedere, il cliente dice sì. Aprire dodici contenuti uno per uno per dire
-- sì a tutti è il lavoro che il cliente rimanda — e finché rimanda, il team
-- non pubblica.
--
-- L'approvazione in blocco è quindi PER MESE, non su tutto: approvare alla
-- cieca anche ciò che riguarda un altro periodo sarebbe un sì che il cliente
-- non ha inteso dare.
-- ============================================================

-- I contenuti hanno già scheduled_at, da cui il mese si ricava. I materiali
-- no: un moodboard è "per settembre" ma nessun campo lo diceva, e nel
-- portale finivano tutti in un mucchio senza periodo.
ALTER TABLE client_materials
  ADD COLUMN IF NOT EXISTS mese_riferimento DATE;

COMMENT ON COLUMN client_materials.mese_riferimento IS
  'Primo del mese a cui si riferisce (es. il moodboard di settembre). NULL se non legato a un mese.';


-- ============================================================
-- Approvazione in blocco
-- ============================================================

DROP FUNCTION IF EXISTS public.portal_approva_tutto();

CREATE OR REPLACE FUNCTION public.portal_approva_mese(p_mese date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_quanti int;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Nessun accesso al portale';
  END IF;

  UPDATE social_posts
  SET client_approval    = 'approved',
      client_comment     = NULL,
      client_reviewed_at = now()
  WHERE client_id = v_client
    -- Solo ciò che è davvero in attesa: chi ha già chiesto modifiche non
    -- viene travolto da un "approva tutto" che cancellerebbe la richiesta.
    AND client_approval = 'pending'
    AND status IN ('ready', 'scheduled')
    -- Senza mese approva tutto l'arretrato; con il mese, solo quello.
    AND (
      p_mese IS NULL
      OR (scheduled_at >= p_mese::timestamptz
          AND scheduled_at < (p_mese + INTERVAL '1 month')::timestamptz)
    );

  GET DIAGNOSTICS v_quanti = ROW_COUNT;
  RETURN v_quanti;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_approva_mese(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_approva_mese(date) TO authenticated;

COMMENT ON FUNCTION public.portal_approva_mese(date) IS
  'Approva in blocco i contenuti in attesa del mese indicato (tutti se NULL). Non tocca quelli su cui il cliente ha già chiesto modifiche.';

NOTIFY pgrst, 'reload schema';
