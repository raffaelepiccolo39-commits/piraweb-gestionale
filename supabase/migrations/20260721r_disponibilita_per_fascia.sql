-- ============================================================
-- Disponibilità shooting: per FASCIA, e da tutto il calendario
-- ============================================================
--
-- Com'era: portal_giorni_occupati guardava solo gli eventi di tipo
-- 'shooting'. Quindi "ferie ufficio dal 14 al 21 agosto" — che in calendario
-- c'è davvero — non bloccava nulla, e il cliente poteva proporre uno shooting
-- in un giorno in cui l'agenzia è chiusa. Poi qualcuno doveva richiamarlo per
-- dirgli di no, che è il contrario del motivo per cui esiste questa pagina.
--
-- E ragionava a GIORNI interi: un impegno alle 15 rendeva indisponibile anche
-- la mattina.
--
-- Adesso: ogni evento del calendario occupa le fasce che tocca davvero.
--   mattina    = 08:00-13:00 (Europe/Rome)
--   pomeriggio = 13:00-19:00
-- Un evento di più giorni le occupa tutte per ogni giorno che attraversa.
--
-- Al cliente escono SOLO giorno e fascia: mai il titolo dell'evento, mai con
-- chi siamo o per cosa. È lo stesso principio della funzione precedente.
-- ============================================================

DROP FUNCTION IF EXISTS public.portal_fasce_occupate(date, date);

CREATE OR REPLACE FUNCTION public.portal_fasce_occupate(p_da date, p_a date)
RETURNS TABLE(giorno date, fascia text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1) Gli impegni in calendario, di qualunque tipo.
  WITH eventi AS (
    SELECT
      (e.start_time AT TIME ZONE 'Europe/Rome') AS inizio,
      (e.end_time   AT TIME ZONE 'Europe/Rome') AS fine,
      e.all_day
    FROM calendar_events e
    WHERE e.end_time >= p_da::timestamptz
      AND e.start_time < (p_a + 1)::timestamptz
  ),
  -- Un evento può attraversare più giorni: si espande giorno per giorno.
  giorni_evento AS (
    SELECT
      g::date AS giorno,
      ev.inizio,
      ev.fine,
      ev.all_day
    FROM eventi ev
    CROSS JOIN LATERAL generate_series(
      greatest(ev.inizio::date, p_da),
      least(ev.fine::date, p_a),
      INTERVAL '1 day'
    ) AS g
  ),
  da_calendario AS (
    SELECT ge.giorno, f.nome AS fascia
    FROM giorni_evento ge
    CROSS JOIN (VALUES
      ('mattina',    TIME '08:00', TIME '13:00'),
      ('pomeriggio', TIME '13:00', TIME '19:00')
    ) AS f(nome, dalle, alle)
    WHERE
      -- Un evento di giornata intera, o che dura più giorni, prende tutto.
      ge.all_day
      OR ge.inizio::date <> ge.fine::date
      -- Altrimenti conta solo se si sovrappone davvero alla fascia.
      OR (ge.inizio::time < f.alle AND ge.fine::time > f.dalle)
  ),
  -- 2) Le date già proposte o confermate ad altri clienti.
  da_richieste AS (
    SELECT r.data_richiesta AS giorno, f.nome AS fascia
    FROM shooting_requests r
    CROSS JOIN (VALUES ('mattina'), ('pomeriggio')) AS f(nome)
    WHERE r.stato IN ('proposta', 'confermata')
      AND r.data_richiesta BETWEEN p_da AND p_a
      -- 'giornata' occupa entrambe; le altre solo la propria.
      AND (r.fascia = 'giornata' OR r.fascia::text = f.nome)
  )
  SELECT giorno, fascia FROM da_calendario
  UNION
  SELECT giorno, fascia FROM da_richieste;
$$;

REVOKE ALL ON FUNCTION public.portal_fasce_occupate(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_fasce_occupate(date, date) TO authenticated;

COMMENT ON FUNCTION public.portal_fasce_occupate(date, date) IS
  'Fasce non disponibili per uno shooting, da TUTTI gli eventi in calendario più le richieste già aperte. Restituisce solo giorno e fascia: mai titolo, cliente o dettagli dell''impegno.';


-- ============================================================
-- Verifica: cosa risulta occupato nei prossimi 45 giorni
-- ============================================================
SELECT giorno, string_agg(fascia, ' + ' ORDER BY fascia) AS fasce_occupate
FROM public.portal_fasce_occupate(CURRENT_DATE, (CURRENT_DATE + 45)::date)
GROUP BY giorno
ORDER BY giorno
LIMIT 30;

NOTIFY pgrst, 'reload schema';
