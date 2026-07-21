-- ============================================================
-- La spunta "letta" sulle idee
-- ============================================================
--
-- Senza, la campanella non poteva avvisare che un'idea era stata valutata:
-- l'avviso sarebbe rimasto acceso per sempre, perché niente diceva che il
-- cliente l'aveva visto. Un contatore che non scende mai smette di voler
-- dire qualcosa, e a quel punto si smette di guardare anche gli altri.
--
-- Si segnano lette aprendo il diario, non premendo un pulsante in più: se
-- l'ha aperto, l'ha visto.
-- ============================================================

ALTER TABLE client_ideas
  ADD COLUMN IF NOT EXISTS letta_dal_cliente_at timestamptz;

COMMENT ON COLUMN client_ideas.letta_dal_cliente_at IS
  'Quando il cliente ha visto la nostra risposta (o la nostra proposta). NULL = c''è qualcosa di nuovo per lui.';

-- Serve alla campanella, che lo chiede a ogni cambio di pagina.
CREATE INDEX IF NOT EXISTS idx_client_ideas_da_leggere
  ON client_ideas(client_id)
  WHERE letta_dal_cliente_at IS NULL;


-- ============================================================
-- "Le ho viste"
-- ============================================================
-- Nessun permesso di UPDATE al cliente: la funzione tocca solo questa
-- colonna e solo sulle righe che lo riguardano.

CREATE OR REPLACE FUNCTION public.portal_segna_idee_lette()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RETURN;
  END IF;

  UPDATE client_ideas
  SET letta_dal_cliente_at = now()
  WHERE client_id = v_client
    AND letta_dal_cliente_at IS NULL
    -- Solo cio' che ha davvero qualcosa da mostrargli: una nostra risposta,
    -- oppure una proposta scritta da noi. Un'idea sua ancora da valutare non
    -- e' "non letta": e' lui che l'ha scritta.
    AND (valutata_at IS NOT NULL OR autore = 'team');
END;
$$;

REVOKE ALL ON FUNCTION public.portal_segna_idee_lette() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_segna_idee_lette() TO authenticated;


-- ============================================================
-- Le idee gia' valutate prima d'ora risultano lette
-- ============================================================
-- Altrimenti al primo ingresso il cliente si troverebbe una campanella
-- accesa su cose di cui abbiamo gia' parlato.
UPDATE client_ideas
SET letta_dal_cliente_at = now()
WHERE letta_dal_cliente_at IS NULL
  AND (valutata_at IS NOT NULL OR autore = 'team');


-- ============================================================
-- Verifica
-- ============================================================
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_ideas' AND column_name = 'letta_dal_cliente_at'
  ) THEN 'ok' ELSE 'MANCA' END AS colonna,
  CASE WHEN to_regprocedure('public.portal_segna_idee_lette()') IS NOT NULL
       THEN 'ok' ELSE 'MANCA' END AS funzione;

NOTIFY pgrst, 'reload schema';
