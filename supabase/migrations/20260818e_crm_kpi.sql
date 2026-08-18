-- ============================================================
-- CRM — query KPI (§10)
-- ============================================================
--
-- Una funzione sola che restituisce un oggetto JSON: in v1 non servono
-- grafici, bastano i numeri, e un endpoint solo evita cinque round-trip per
-- disegnare cinque cifre.
--
-- Le opportunità con `importato` = true sono escluse da sales cycle e close
-- rate: sono state caricate a mano dallo storico e il loro tempo di
-- attraversamento non è mai esistito davvero (§11).
--
-- ORDINE DI ESECUZIONE: dopo 20260818b.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_kpi(p_giorni INTEGER DEFAULT 90)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_da            TIMESTAMPTZ := now() - (p_giorni || ' days')::interval;
  v_sales_cycle   NUMERIC;
  v_close_rate    NUMERIC;
  v_next_action   NUMERIC;
  v_per_source    JSONB;
  v_per_stage     JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Riservato alla direzione' USING ERRCODE = 'PT403';
  END IF;

  -- Sales cycle medio: dalla prima riga di storico al passaggio a esito,
  -- sui soli deal vinti e non importati.
  SELECT AVG(EXTRACT(EPOCH FROM (vinta.changed_at - nascita.changed_at)) / 86400.0)
    INTO v_sales_cycle
  FROM crm_stage_log vinta
  JOIN LATERAL (
    SELECT MIN(changed_at) AS changed_at FROM crm_stage_log
    WHERE deal_id = vinta.deal_id
  ) nascita ON true
  JOIN deals d ON d.id = vinta.deal_id
  WHERE vinta.stage_a = 7
    AND d.esito = 'won'
    AND NOT d.importato
    AND vinta.changed_at > v_da;

  -- Close rate sulle proposte: vinte su tutto ciò che è arrivato almeno
  -- alla proposta o si è comunque chiuso.
  SELECT COUNT(*) FILTER (WHERE esito = 'won')::numeric
       / NULLIF(COUNT(*) FILTER (WHERE stage_id >= 5 OR esito IS NOT NULL), 0)
    INTO v_close_rate
  FROM deals
  WHERE created_at > v_da AND NOT importato;

  -- KPI di igiene: la percentuale di aperte con la prossima azione.
  -- È il primo numero da guardare, target > 95%.
  SELECT COUNT(*) FILTER (WHERE data_prossima_azione IS NOT NULL)::numeric
       / NULLIF(COUNT(*), 0)
    INTO v_next_action
  FROM deals d
  JOIN crm_stage s ON s.id = d.stage_id
  WHERE d.esito IS NULL AND s.is_aperto;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'source'), '[]'::jsonb) INTO v_per_source
  FROM (
    SELECT jsonb_build_object(
             'source', source::text,
             'lead', COUNT(*),
             'won', COUNT(*) FILTER (WHERE esito = 'won'),
             'canone_medio_won', ROUND(AVG(canone_proposto) FILTER (WHERE esito = 'won'), 2)
           ) AS r
    FROM deals GROUP BY source
  ) x;

  -- Dove si inceppa la pipeline: giorni medi di permanenza per stage.
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'stage')::int), '[]'::jsonb) INTO v_per_stage
  FROM (
    SELECT jsonb_build_object(
             'stage', stage_da,
             'etichetta', (SELECT etichetta FROM crm_stage WHERE id = t.stage_da),
             'giorni_medi', ROUND(AVG(giorni)::numeric, 1)
           ) AS r
    FROM (
      SELECT stage_da,
             EXTRACT(EPOCH FROM (changed_at - LAG(changed_at) OVER (PARTITION BY deal_id ORDER BY changed_at))) / 86400.0 AS giorni
      FROM crm_stage_log
    ) t
    WHERE t.stage_da IS NOT NULL AND t.giorni IS NOT NULL
    GROUP BY t.stage_da
  ) y;

  RETURN jsonb_build_object(
    'giorni', p_giorni,
    'sales_cycle_giorni', ROUND(v_sales_cycle, 1),
    'close_rate', ROUND(v_close_rate, 3),
    'pct_con_next_action', ROUND(v_next_action, 3),
    'per_source', v_per_source,
    'per_stage', v_per_stage
  );
END;
$$;

COMMENT ON FUNCTION public.crm_kpi(INTEGER) IS
  '§10: sales cycle, close rate, igiene next action, conversione per source, permanenza per stage.';

REVOKE EXECUTE ON FUNCTION public.crm_kpi(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_kpi(INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
