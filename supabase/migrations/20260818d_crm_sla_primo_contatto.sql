-- ============================================================
-- CRM — SLA sul primo contatto (§8.1)
-- ============================================================
--
-- La specifica interroga "opportunità stage 0 o 1 con task 'primo contatto'
-- non completato": quella task va quindi creata, e la crea il database
-- all'ingresso del lead, non la UI. Un lead che arriva dal form del sito o
-- dal cron delle ADV deve avere il suo SLA come tutti gli altri.
--
-- Lo SLA è in ORE LAVORATIVE (§6.4): due ore di venerdì alle 18:00 scadono
-- lunedì mattina, non durante il fine settimana.
--
-- ORDINE DI ESECUZIONE: dopo 20260818b.
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_task_primo_contatto()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id = 0 AND NOT NEW.importato THEN
    INSERT INTO crm_attivita (deal_id, tipo, titolo, descrizione, owner_id, due_at, origine, chiave_job)
    VALUES (
      NEW.id, 'call', 'Primo contatto',
      'SLA: 2 ore lavorative dall''ingresso del lead.',
      NEW.owner_id,
      public.add_business_hours(NEW.data_ingresso_stage, 2),
      'automazione', 'primo_contatto'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS crm_6_primo_contatto ON deals;
CREATE TRIGGER crm_6_primo_contatto
  AFTER INSERT ON deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_task_primo_contatto();


-- Chi ha sforato, e di quanto. Il job legge questa e non ricalcola niente:
-- la definizione di "scaduto" sta in un posto solo.
CREATE OR REPLACE FUNCTION public.crm_sla_primo_contatto_scaduti()
RETURNS TABLE (
  deal_id     UUID,
  titolo      TEXT,
  azienda     TEXT,
  owner_id    UUID,
  ore_soglia  SMALLINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.title, d.company_name, d.owner_id,
         (CASE WHEN now() >= public.add_business_hours(d.data_ingresso_stage, 4) THEN 4 ELSE 2 END)::smallint
  FROM deals d
  JOIN crm_attivita a
    ON a.deal_id = d.id AND a.chiave_job = 'primo_contatto' AND a.stato = 'aperta'
  WHERE d.esito IS NULL
    AND d.stage_id IN (0, 1)
    AND now() >= public.add_business_hours(d.data_ingresso_stage, 2);
$$;

COMMENT ON FUNCTION public.crm_sla_primo_contatto_scaduti() IS
  '§8.1: lead in stage 0/1 con il primo contatto ancora aperto oltre le 2 (o 4) ore lavorative.';

REVOKE EXECUTE ON FUNCTION public.crm_sla_primo_contatto_scaduti() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_sla_primo_contatto_scaduti() TO authenticated;

NOTIFY pgrst, 'reload schema';
