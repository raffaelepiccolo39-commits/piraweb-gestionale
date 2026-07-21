-- ============================================================
-- Il cliente propone una data per lo shooting, il team approva
-- ============================================================
--
-- Quando il piano editoriale sta per finire (client_ped_coverage.covered_until)
-- il cliente va avvisato di fissare un nuovo shooting. Finora l'avviso a 14
-- giorni esisteva ma andava solo AL TEAM (cron ped-monitor): il cliente non
-- sapeva nulla, e toccava a qualcuno ricordarsi di scrivergli.
--
-- Qui il cliente propone giorno e fascia guardando le nostre disponibilità,
-- e la proposta resta tale finché il team non la conferma. Non si prenota da
-- solo: una troupe e un set non si spostano come un appuntamento.
--
-- Giorno + fascia, non slot da 30 minuti: quelli servono alle consulenze
-- (/api/booking/slots), uno shooting occupa mezza giornata.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE shooting_fascia AS ENUM ('mattina', 'pomeriggio', 'giornata');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE shooting_stato AS ENUM ('proposta', 'confermata', 'rifiutata');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS shooting_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  data_richiesta DATE NOT NULL,
  fascia shooting_fascia NOT NULL DEFAULT 'mattina',
  nota_cliente TEXT,

  stato shooting_stato NOT NULL DEFAULT 'proposta',
  -- Perché è stata rifiutata, o una controproposta a voce: il cliente la legge.
  risposta_team TEXT,
  -- L'evento creato in calendario quando viene confermata.
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,

  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shooting_req_cliente ON shooting_requests(client_id, stato);
CREATE INDEX IF NOT EXISTS idx_shooting_req_data ON shooting_requests(data_richiesta);

DROP TRIGGER IF EXISTS set_shooting_requests_updated_at ON shooting_requests;
CREATE TRIGGER set_shooting_requests_updated_at
  BEFORE UPDATE ON shooting_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE shooting_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Il team gestisce le richieste shooting" ON shooting_requests;
CREATE POLICY "Il team gestisce le richieste shooting" ON shooting_requests
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Il cliente vede le proprie richieste" ON shooting_requests;
CREATE POLICY "Il cliente vede le proprie richieste" ON shooting_requests
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());


-- ============================================================
-- La proposta del cliente
-- ============================================================
-- Come per i post e i materiali: nessun permesso di scrittura al cliente,
-- una funzione che accetta solo quel gesto.

CREATE OR REPLACE FUNCTION public.portal_richiedi_shooting(
  p_data date,
  p_fascia text,
  p_nota text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_id uuid;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Nessun accesso al portale';
  END IF;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'La data proposta è già passata';
  END IF;

  IF p_fascia NOT IN ('mattina', 'pomeriggio', 'giornata') THEN
    RAISE EXCEPTION 'Fascia non valida: %', p_fascia;
  END IF;

  -- Una proposta aperta alla volta: due richieste pendenti dello stesso
  -- cliente costringerebbero il team a scegliere per lui.
  IF EXISTS (
    SELECT 1 FROM shooting_requests
    WHERE client_id = v_client AND stato = 'proposta'
  ) THEN
    RAISE EXCEPTION 'Hai già una proposta in attesa di conferma';
  END IF;

  INSERT INTO shooting_requests (client_id, data_richiesta, fascia, nota_cliente)
  VALUES (v_client, p_data, p_fascia::shooting_fascia, nullif(btrim(coalesce(p_nota, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_richiedi_shooting(date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_richiedi_shooting(date, text, text) TO authenticated;


-- ============================================================
-- Giorni già occupati da uno shooting
-- ============================================================
-- Serve al portale per non far proporre al cliente un giorno in cui siamo
-- già impegnati. Restituisce solo le DATE, mai i dettagli degli impegni:
-- il cliente non deve sapere con chi siamo o cosa stiamo facendo.

CREATE OR REPLACE FUNCTION public.portal_giorni_occupati(p_da date, p_a date)
RETURNS TABLE(giorno date)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT (start_time AT TIME ZONE 'Europe/Rome')::date
  FROM calendar_events
  WHERE event_type = 'shooting'
    AND start_time >= p_da::timestamptz
    AND start_time < (p_a + 1)::timestamptz
  UNION
  SELECT DISTINCT data_richiesta
  FROM shooting_requests
  WHERE stato IN ('proposta', 'confermata')
    AND data_richiesta BETWEEN p_da AND p_a;
$$;

REVOKE ALL ON FUNCTION public.portal_giorni_occupati(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_giorni_occupati(date, date) TO authenticated;


-- ============================================================
-- Verifica
-- ============================================================
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shooting_requests' ORDER BY cmd;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Traccia l'avviso mandato al CLIENTE
-- ============================================================
-- `alert_sent_for` esisteva già ma segna l'avviso interno (cron ped-monitor
-- → notifica al team). Quello al cliente è un'altra cosa e va tracciato a
-- parte, o il primo dei due impedirebbe l'altro.

ALTER TABLE client_ped_coverage
  ADD COLUMN IF NOT EXISTS client_alert_sent_for DATE;

COMMENT ON COLUMN client_ped_coverage.client_alert_sent_for IS
  'covered_until per cui è già partita l''email al cliente ("prenota lo shooting"). Evita di ripeterla ogni giorno.';

NOTIFY pgrst, 'reload schema';
