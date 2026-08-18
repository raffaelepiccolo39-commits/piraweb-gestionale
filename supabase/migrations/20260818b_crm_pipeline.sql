-- ============================================================
-- CRM commerciale — passo 2: modello, regole, calendario
-- ============================================================
--
-- Traduzione della specifica "Pira Web CRM v1" sul gestionale esistente.
-- Scelta di fondo (§3.1: "se AZIENDA e CONTATTO esistono già, non
-- duplicarle"): l'opportunità della specifica È la tabella `deals`, che
-- esiste dal 00044 e in produzione contiene 12 record. Si estende quella.
-- Non si crea una crm_opportunita parallela: sarebbe un secondo CRM dentro
-- lo stesso gestionale.
--
-- Mappatura specifica -> gestionale:
--   crm_opportunita       -> deals (esteso qui)
--   azienda_id / contatto -> deals.company_name / contact_* (testo libero:
--                            le tabelle azienda/contatto non esistono, e
--                            `clients` contiene i clienti ACQUISITI, non i
--                            prospect. Assunzione A1 verificata falsa.)
--   utente                -> profiles (uuid)
--   crm_attivita          -> tabella nuova: `tasks` ha project_id NOT NULL
--                            e una task commerciale non ha un progetto.
--                            (Assunzione A3 verificata: motore task c'è,
--                            ma non è riusabile qui.)
--   BIGSERIAL             -> uuid, come tutto il resto del gestionale
--
-- Assunzione A5 verificata falsa: il modulo presenze registra timbrature ma
-- non ha né festività né calendario lavorativo. Si creano qui (§6.4).
--
-- ORDINE DI ESECUZIONE: dopo 20260818_crm_enum_valori.sql.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Enum (§3.2)
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN CREATE TYPE crm_esito AS ENUM ('won','lost','nurture'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm_motivo_lost AS ENUM ('prezzo','timing','no_decision_maker','concorrente','no_fit','silenzio'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm_attivita_tipo AS ENUM ('task','call','email','meeting','nota'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm_attivita_origine AS ENUM ('manuale','automazione'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crm_attivita_stato AS ENUM ('aperta','completata','annullata'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ════════════════════════════════════════════════════════════
-- 2. Stage in tabella di lookup (§3.3)
-- ════════════════════════════════════════════════════════════
-- Non hardcodati: servono etichette in UI, ordinamento kanban e SLA
-- modificabili senza rideploy.

CREATE TABLE IF NOT EXISTS crm_stage (
  id            SMALLINT PRIMARY KEY,          -- 0..9
  codice        VARCHAR(40) NOT NULL UNIQUE,
  etichetta     VARCHAR(80) NOT NULL,
  ordine        SMALLINT NOT NULL,
  is_aperto     BOOLEAN NOT NULL,              -- true = conta nella pipeline attiva
  sla_giorni    NUMERIC(5,2),                  -- NULL = nessuno SLA
  sla_ore_lav   NUMERIC(5,2)                   -- SLA in ore lavorative (§6.4)
);

INSERT INTO crm_stage (id, codice, etichetta, ordine, is_aperto, sla_giorni, sla_ore_lav) VALUES
  (0, 'lead',              'Lead',                  0, true,  1,    NULL),
  (1, 'contattato',        'Contattato',            1, true,  NULL, 2),
  (2, 'qualificato',       'Qualificato',           2, true,  3,    NULL),
  (3, 'discovery_fissata', 'Discovery fissata',     3, true,  5,    NULL),
  (4, 'discovery_fatta',   'Discovery fatta',       4, true,  NULL, 2),
  (5, 'proposta_inviata',  'Proposta inviata',      5, true,  3,    NULL),
  (6, 'negoziazione',      'Negoziazione',          6, true,  21,   NULL),
  (7, 'esito',             'Won / Lost / Nurture',  7, false, NULL, NULL),
  (8, 'contratto',         'Contratto e incasso',   8, false, NULL, NULL),
  (9, 'onboarding',        'Onboarding',            9, false, 5,    NULL)
ON CONFLICT (id) DO UPDATE SET
  codice = EXCLUDED.codice, etichetta = EXCLUDED.etichetta, ordine = EXCLUDED.ordine,
  is_aperto = EXCLUDED.is_aperto, sla_giorni = EXCLUDED.sla_giorni, sla_ore_lav = EXCLUDED.sla_ore_lav;


-- ════════════════════════════════════════════════════════════
-- 3. Pesi del lead score, configurabili (§6.2)
-- ════════════════════════════════════════════════════════════
-- "I pesi devono essere configurabili da tabella, non costanti nel codice:
--  verranno ricalibrati dopo i primi 90 giorni di dati."
-- `campo` è il nome esatto della colonna booleana su deals: il trigger di
-- calcolo legge questa tabella, quindi cambiare un peso qui cambia il
-- punteggio senza toccare una riga di codice.

CREATE TABLE IF NOT EXISTS crm_lead_score_pesi (
  campo      VARCHAR(40) PRIMARY KEY,
  etichetta  TEXT NOT NULL,
  peso       SMALLINT NOT NULL,
  ordine     SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO crm_lead_score_pesi (campo, etichetta, peso, ordine) VALUES
  ('q_problema_chiaro',      'Il problema è chiaro',                 10, 1),
  ('q_urgenza',              'C''è urgenza',                          15, 2),
  ('q_obiettivo_misurabile', 'Obiettivo misurabile',                 10, 3),
  ('q_budget_adeguato',      'Budget adeguato',                      20, 4),
  ('q_decision_maker',       'Parliamo con chi decide',              15, 5),
  ('q_azienda_strutturata',  'Azienda strutturata',                  10, 6),
  ('q_necessita_social',     'Ha bisogno di social',                 10, 7),
  ('q_necessita_web',        'Ha bisogno di web',                    10, 8),
  ('q_nessun_budget',        'Dichiara di non avere budget',        -20, 9),
  ('q_solo_prezzo',          'Guarda solo il prezzo',               -10, 10)
ON CONFLICT (campo) DO UPDATE SET
  etichetta = EXCLUDED.etichetta, peso = EXCLUDED.peso, ordine = EXCLUDED.ordine;


-- ════════════════════════════════════════════════════════════
-- 4. Calendario lavorativo (§6.4)
-- ════════════════════════════════════════════════════════════
-- Gli SLA degli stage 1 e 4 sono in ORE LAVORATIVE, non solari. La specifica
-- diceva di riusare il calendario delle presenze: verificato, non esiste —
-- attendance_records registra timbrature e basta. Si crea qui, minimale.
--
-- Orario aziendale: lun-ven 09:00-13:30 e 15:00-18:30 = 8 ore/giorno.
-- Se un giorno l'orario cambia, si tocca solo questa funzione.

CREATE TABLE IF NOT EXISTS festivita (
  data        DATE PRIMARY KEY,
  descrizione TEXT NOT NULL
);

-- Festività nazionali italiane 2026-2027. Pasquetta: 6 apr 2026, 29 mar 2027.
-- Le chiusure aziendali (ponti, ferie collettive, patrono) si aggiungono a mano.
INSERT INTO festivita (data, descrizione) VALUES
  ('2026-01-01','Capodanno'), ('2026-01-06','Epifania'), ('2026-04-06','Lunedì dell''Angelo'),
  ('2026-04-25','Liberazione'), ('2026-05-01','Festa dei lavoratori'), ('2026-06-02','Festa della Repubblica'),
  ('2026-08-15','Ferragosto'), ('2026-11-01','Ognissanti'), ('2026-12-08','Immacolata'),
  ('2026-12-25','Natale'), ('2026-12-26','Santo Stefano'),
  ('2027-01-01','Capodanno'), ('2027-01-06','Epifania'), ('2027-03-29','Lunedì dell''Angelo'),
  ('2027-04-25','Liberazione'), ('2027-05-01','Festa dei lavoratori'), ('2027-06-02','Festa della Repubblica'),
  ('2027-08-15','Ferragosto'), ('2027-11-01','Ognissanti'), ('2027-12-08','Immacolata'),
  ('2027-12-25','Natale'), ('2027-12-26','Santo Stefano')
ON CONFLICT (data) DO NOTHING;

ALTER TABLE festivita ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Festività in lettura al team" ON festivita;
CREATE POLICY "Festività in lettura al team" ON festivita
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "Festività gestite dagli admin" ON festivita;
CREATE POLICY "Festività gestite dagli admin" ON festivita
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


CREATE OR REPLACE FUNCTION public.is_giorno_lavorativo(p_data DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXTRACT(ISODOW FROM p_data) <= 5
     AND NOT EXISTS (SELECT 1 FROM festivita WHERE data = p_data);
$$;

COMMENT ON FUNCTION public.is_giorno_lavorativo(DATE) IS
  'Lun-ven e non in tabella festivita. Base del calcolo delle ore lavorative.';


-- add_business_hours(quando, ore) -> quando saranno passate `ore` LAVORATIVE.
-- Se il punto di partenza cade fuori orario, il conteggio comincia
-- dall'apertura successiva: un lead arrivato alle 23:40 ha le sue 2 ore di
-- SLA a partire dalle 09:00 del giorno dopo, non scadute all'alba.
CREATE OR REPLACE FUNCTION public.add_business_hours(p_da TIMESTAMPTZ, p_ore NUMERIC)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cur       TIMESTAMP;      -- ora locale Europe/Rome
  v_giorno    DATE;
  v_resto     NUMERIC;
  v_fine_seg  TIMESTAMP;
  v_disp      NUMERIC;        -- ore disponibili nel segmento corrente
  v_giri      INT := 0;
BEGIN
  IF p_da IS NULL OR p_ore IS NULL THEN RETURN NULL; END IF;
  IF p_ore < 0 THEN RAISE EXCEPTION 'add_business_hours: ore negative (%)', p_ore; END IF;

  v_cur   := p_da AT TIME ZONE 'Europe/Rome';
  v_resto := p_ore;

  LOOP
    v_giri := v_giri + 1;
    IF v_giri > 2000 THEN
      RAISE EXCEPTION 'add_business_hours: troppe iterazioni (da=%, ore=%)', p_da, p_ore;
    END IF;

    v_giorno := v_cur::date;

    -- Giorno non lavorativo: si riparte dall'apertura del giorno dopo.
    IF NOT public.is_giorno_lavorativo(v_giorno) THEN
      v_cur := (v_giorno + 1) + TIME '09:00';
      CONTINUE;
    END IF;

    -- Riallineo il cursore dentro una delle due fasce.
    IF v_cur < v_giorno + TIME '09:00' THEN
      v_cur := v_giorno + TIME '09:00';
    ELSIF v_cur >= v_giorno + TIME '13:30' AND v_cur < v_giorno + TIME '15:00' THEN
      v_cur := v_giorno + TIME '15:00';
    ELSIF v_cur >= v_giorno + TIME '18:30' THEN
      v_cur := (v_giorno + 1) + TIME '09:00';
      CONTINUE;
    END IF;

    v_fine_seg := v_giorno + CASE WHEN v_cur < v_giorno + TIME '13:30'
                                  THEN TIME '13:30' ELSE TIME '18:30' END;
    v_disp := EXTRACT(EPOCH FROM (v_fine_seg - v_cur)) / 3600.0;

    IF v_disp >= v_resto THEN
      RETURN (v_cur + (v_resto || ' hours')::interval) AT TIME ZONE 'Europe/Rome';
    END IF;

    v_resto := v_resto - v_disp;
    v_cur   := v_fine_seg;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.add_business_hours(TIMESTAMPTZ, NUMERIC) IS
  'Somma ore LAVORATIVE (lun-ven 09:00-13:30 e 15:00-18:30, festivi esclusi). Usata dagli SLA degli stage 1 e 4.';

REVOKE EXECUTE ON FUNCTION public.is_giorno_lavorativo(DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_business_hours(TIMESTAMPTZ, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_giorno_lavorativo(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_business_hours(TIMESTAMPTZ, NUMERIC) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 5. Soglia minima di canone (V9), configurabile a runtime
-- ════════════════════════════════════════════════════════════
-- "valore configurabile a runtime da impostazioni, non hardcodato".
-- Parte a 0 = regola inattiva, per decisione del referente funzionale: la
-- soglia si alza dalle impostazioni quando ci saranno i dati di marginalità.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS crm_soglia_canone_minimo NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN company_settings.crm_soglia_canone_minimo IS
  'V9: sotto questo canone mensile il salvataggio richiede un admin. 0 = nessuna soglia.';


-- ════════════════════════════════════════════════════════════
-- 6. Colonne dell'opportunità su `deals` (§3.4)
-- ════════════════════════════════════════════════════════════

ALTER TABLE deals
  -- provenienza
  ADD COLUMN IF NOT EXISTS referrer               VARCHAR(160),

  -- stato
  ADD COLUMN IF NOT EXISTS stage_id               SMALLINT REFERENCES crm_stage(id),
  ADD COLUMN IF NOT EXISTS data_ingresso_stage    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- prossima azione (V7: il cuore della specifica)
  ADD COLUMN IF NOT EXISTS prossima_azione        VARCHAR(300),
  ADD COLUMN IF NOT EXISTS data_prossima_azione   DATE,

  -- qualificazione: input del lead score (§6.2)
  ADD COLUMN IF NOT EXISTS q_problema_chiaro      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_urgenza              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_obiettivo_misurabile BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_budget_adeguato      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_decision_maker       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_azienda_strutturata  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_necessita_social     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_necessita_web        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_nessun_budget        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS q_solo_prezzo          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_score             SMALLINT NOT NULL DEFAULT 0,

  -- economics: canone e una tantum SEMPRE separati (§3.4, non negoziabile)
  ADD COLUMN IF NOT EXISTS canone_proposto        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS una_tantum_proposto    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS durata_mesi            SMALLINT,

  -- discovery strutturata (V3)
  ADD COLUMN IF NOT EXISTS disc_situazione        TEXT,
  ADD COLUMN IF NOT EXISTS disc_problema          TEXT,
  ADD COLUMN IF NOT EXISTS disc_impatto           TEXT,
  ADD COLUMN IF NOT EXISTS disc_obiettivo         TEXT,
  ADD COLUMN IF NOT EXISTS disc_timing            TEXT,
  ADD COLUMN IF NOT EXISTS disc_budget            TEXT,
  ADD COLUMN IF NOT EXISTS disc_decision_maker    TEXT,

  -- chiusura
  ADD COLUMN IF NOT EXISTS esito                  crm_esito,
  ADD COLUMN IF NOT EXISTS motivo_lost            crm_motivo_lost,
  ADD COLUMN IF NOT EXISTS data_ripresa           DATE,

  -- derivati e servizio
  ADD COLUMN IF NOT EXISTS flag_fermo             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fermo_dal              DATE,
  ADD COLUMN IF NOT EXISTS importato              BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN deals.lead_score IS
  'Calcolato dal trigger da q_* e crm_lead_score_pesi. V8: mai scrivibile a mano.';
COMMENT ON COLUMN deals.importato IS
  '§11: riga caricata dallo storico. Il suo sales cycle è inattendibile, si esclude dai KPI.';
COMMENT ON COLUMN deals.fermo_dal IS
  'Da quando flag_fermo è true. Serve alla soglia "fermo da oltre 14 giorni" (§8.3).';

-- Valore di pipeline (§6.1). Colonna generata: non può divergere dai campi
-- che la compongono, e nessun servizio può scriverla per sbaglio.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS valore_pipeline NUMERIC(12,2)
    GENERATED ALWAYS AS (
      COALESCE(canone_proposto, 0) * COALESCE(durata_mesi, 0)
      + COALESCE(una_tantum_proposto, 0)
    ) STORED;


-- ════════════════════════════════════════════════════════════
-- 7. Storico degli stage (§3.5)
-- ════════════════════════════════════════════════════════════
-- "È l'unica base su cui si calcolano sales cycle e tempi di permanenza per
--  stage: senza, i KPI di §10 non esistono."

CREATE TABLE IF NOT EXISTS crm_stage_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  stage_da     SMALLINT REFERENCES crm_stage(id),
  stage_a      SMALLINT NOT NULL REFERENCES crm_stage(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  utente_id    UUID REFERENCES profiles(id),
  note         TEXT
);

COMMENT ON TABLE crm_stage_log IS
  'Storico dei passaggi di stage, scritto dal trigger su deals. Base dei KPI §10.';


-- ════════════════════════════════════════════════════════════
-- 8. Attività commerciali (§3.6)
-- ════════════════════════════════════════════════════════════
-- Tabella dedicata e non `tasks`: tasks.project_id è NOT NULL e una task
-- commerciale non ha un progetto. Renderlo nullable avrebbe indebolito un
-- vincolo che regge tutto il modulo delivery.

CREATE TABLE IF NOT EXISTS crm_attivita (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  tipo           crm_attivita_tipo NOT NULL,
  titolo         VARCHAR(200) NOT NULL,
  descrizione    TEXT,
  owner_id       UUID NOT NULL REFERENCES profiles(id),
  due_at         TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  stato          crm_attivita_stato NOT NULL DEFAULT 'aperta',
  origine        crm_attivita_origine NOT NULL DEFAULT 'manuale',
  sequenza       VARCHAR(40),      -- es. 'followup_proposta'
  sequenza_step  SMALLINT,         -- 1..4
  -- Idempotenza dei job (§8.1: "una sola notifica per soglia"). Chiave
  -- libera del tipo 'sla:2h' o 'fermo:2026-08-18': l'indice unico più sotto
  -- impedisce al job di creare due volte la stessa attività.
  chiave_job     VARCHAR(60),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN crm_attivita.chiave_job IS
  'Idempotenza dei job schedulati: un job rilanciato non duplica attività né notifiche.';


-- ════════════════════════════════════════════════════════════
-- 9. Allineamento dei 12 record già in produzione
-- ════════════════════════════════════════════════════════════
-- Va fatto PRIMA di creare i trigger di validazione, altrimenti le regole
-- nuove rifiuterebbero le righe vecchie mentre le si sistema.

-- Provenienza: dalla vecchia tassonomia a quella della specifica.
UPDATE deals SET source = CASE source::text
    WHEN 'website'        THEN 'inbound'
    WHEN 'social_media'   THEN 'inbound'
    WHEN 'cold_outreach'  THEN 'outbound'
    WHEN 'event'          THEN 'partnership'
    WHEN 'ads'            THEN 'paid'
    WHEN 'other'          THEN 'inbound'
    ELSE source::text
  END::deal_source
  WHERE source::text IN ('website','social_media','cold_outreach','event','ads','other');

UPDATE deals SET source = 'inbound' WHERE source IS NULL;

-- V2 vale anche all'indietro: un referral senza segnalatore sarebbe una riga
-- che non si riesce più a salvare. Chi ha segnalato lo si scrive a mano.
UPDATE deals SET referrer = 'Da ricostruire (import iniziale)'
  WHERE source = 'referral' AND COALESCE(TRIM(referrer), '') = '';
ALTER TABLE deals ALTER COLUMN source SET DEFAULT 'inbound';
ALTER TABLE deals ALTER COLUMN source SET NOT NULL;

-- Stage: dai 5 stage vecchi ai 10 della specifica.
UPDATE deals SET stage_id = CASE stage
    WHEN 'lead'        THEN 0
    WHEN 'qualified'   THEN 2
    WHEN 'proposal'    THEN 5
    WHEN 'negotiation' THEN 6
    WHEN 'closed_won'  THEN 7
    WHEN 'closed_lost' THEN 7
  END
  WHERE stage_id IS NULL;

UPDATE deals SET esito = 'won'  WHERE stage = 'closed_won'  AND esito IS NULL;
-- Le trattative perse dello storico non hanno un motivo strutturato: il campo
-- libero lost_reason non è mappabile sull'enum. Si mette 'silenzio', che è il
-- motivo neutro, e resta lost_reason a raccontare la storia vera.
UPDATE deals SET esito = 'lost', motivo_lost = COALESCE(motivo_lost, 'silenzio')
  WHERE stage = 'closed_lost' AND esito IS NULL;

ALTER TABLE deals ALTER COLUMN stage_id SET DEFAULT 0;
UPDATE deals SET stage_id = 0 WHERE stage_id IS NULL;
ALTER TABLE deals ALTER COLUMN stage_id SET NOT NULL;

-- Economics: monthly_value e value erano i due campi vecchi. La durata non
-- esisteva: 12 mesi è l'ipotesi che rende il valore di pipeline leggibile
-- invece che zero. Sono righe marcate `importato`, quindi fuori dai KPI.
UPDATE deals SET
    canone_proposto     = COALESCE(canone_proposto, monthly_value),
    una_tantum_proposto = COALESCE(una_tantum_proposto, NULLIF(value, 0)),
    durata_mesi         = COALESCE(durata_mesi, CASE WHEN monthly_value IS NOT NULL THEN 12 END),
    data_ingresso_stage = COALESCE(data_ingresso_stage, updated_at),
    importato           = true
  WHERE created_at < now();

-- V7 vale anche per lo storico: senza prossima azione queste righe sarebbero
-- inaggiornabili per sempre. Si assegna un promemoria esplicito, da svuotare
-- alla prima Sales Review.
UPDATE deals SET
    prossima_azione      = COALESCE(prossima_azione, 'Da rivedere: opportunità precedente al nuovo CRM'),
    data_prossima_azione = COALESCE(data_prossima_azione, CURRENT_DATE)
  WHERE esito IS NULL AND stage_id BETWEEN 0 AND 6;

-- Riga di partenza nello storico stage, così i KPI hanno un ancoraggio.
INSERT INTO crm_stage_log (deal_id, stage_da, stage_a, changed_at, utente_id, note)
SELECT d.id, NULL, d.stage_id, d.created_at, d.created_by, 'Allineamento al nuovo modello stage'
FROM deals d
WHERE NOT EXISTS (SELECT 1 FROM crm_stage_log l WHERE l.deal_id = d.id);

-- Le vecchie deal_activities diventano attività commerciali. La tabella
-- resta in piedi (non si droppa nulla di occupato), ma da qui in avanti si
-- scrive solo su crm_attivita.
INSERT INTO crm_attivita (deal_id, tipo, titolo, descrizione, owner_id, completed_at, stato, origine, created_at)
SELECT a.deal_id,
       CASE a.type WHEN 'call' THEN 'call' WHEN 'email' THEN 'email'
                   WHEN 'meeting' THEN 'meeting' ELSE 'nota' END::crm_attivita_tipo,
       a.title, a.description, a.created_by,
       CASE WHEN a.completed THEN a.created_at END,
       CASE WHEN a.completed THEN 'completata' ELSE 'aperta' END::crm_attivita_stato,
       'manuale', a.created_at
FROM deal_activities a
WHERE NOT EXISTS (
  SELECT 1 FROM crm_attivita c
  WHERE c.deal_id = a.deal_id AND c.titolo = a.title AND c.created_at = a.created_at
);


-- ════════════════════════════════════════════════════════════
-- 10. Lead score calcolato, mai scritto (§6.2, V8)
-- ════════════════════════════════════════════════════════════
-- Il punteggio si ricava dai flag q_* leggendo i pesi dalla tabella: qualsiasi
-- valore arrivi dal client viene sovrascritto, quindi V8 è vera per
-- costruzione — API, SQL Editor e import compresi.

CREATE OR REPLACE FUNCTION public.crm_calcola_lead_score()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_score INTEGER;
BEGIN
  SELECT COALESCE(SUM(p.peso), 0) INTO v_score
  FROM crm_lead_score_pesi p
  WHERE COALESCE((to_jsonb(NEW) ->> p.campo)::boolean, false);

  NEW.lead_score := v_score;
  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- 11. Validazioni bloccanti (§4) e transizioni (§5)
-- ════════════════════════════════════════════════════════════
-- Stanno nel database e non solo nel service layer: così valgono anche per
-- l'import CSV, per i job, per i webhook e per chi apre l'SQL Editor.
-- I messaggi sono quelli letterali della specifica: il service layer li
-- rigira al client così come sono.
--
-- SQLSTATE PT400: PostgREST lo traduce in HTTP 400. Un errore di validazione
-- non è un guasto del server e non deve finire fra le anomalie.

CREATE OR REPLACE FUNCTION public.crm_valida_deal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_aperto    BOOLEAN;
  v_mancanti  TEXT[] := ARRAY[]::TEXT[];
  v_soglia    NUMERIC;
BEGIN
  -- ── §5 Transizioni ──────────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN

    -- Avanzamento: uno stage per volta. Unica eccezione, il salto all'esito
    -- da una qualsiasi fase di trattativa.
    IF NEW.stage_id > OLD.stage_id
       AND NEW.stage_id <> OLD.stage_id + 1
       AND NOT (NEW.stage_id = 7 AND OLD.stage_id BETWEEN 2 AND 6) THEN
      RAISE EXCEPTION 'Si avanza di uno stage per volta: da % non si salta a %',
        OLD.stage_id, NEW.stage_id USING ERRCODE = 'PT400';
    END IF;

    -- Riapertura: solo dal nurture, e si torna a Qualificato (§5).
    IF OLD.stage_id = 7 AND NEW.stage_id < 7 THEN
      IF OLD.esito IS DISTINCT FROM 'nurture' THEN
        RAISE EXCEPTION 'Si riaprono solo le opportunità in nurture'
          USING ERRCODE = 'PT400';
      END IF;
      IF NEW.stage_id <> 2 THEN
        RAISE EXCEPTION 'Una opportunità riaperta torna allo stage Qualificato'
          USING ERRCODE = 'PT400';
      END IF;
      NEW.esito       := NULL;
      NEW.motivo_lost := NULL;
      NEW.data_ripresa := NULL;
    END IF;

    -- Ogni transizione riparte da zero: data di ingresso, e non è più ferma.
    NEW.data_ingresso_stage := now();
    NEW.flag_fermo := false;
    NEW.fermo_dal  := NULL;
  END IF;

  -- ── V2 provenienza referral ─────────────────────────────
  IF NEW.source = 'referral' AND COALESCE(TRIM(NEW.referrer), '') = '' THEN
    RAISE EXCEPTION 'Indica chi ha segnalato il contatto' USING ERRCODE = 'PT400';
  END IF;

  -- ── V3 discovery completa prima della proposta ──────────
  -- Esente lo storico importato: di una trattativa del 2025 la discovery non
  -- si ricostruisce, e bloccarla la renderebbe inaggiornabile per sempre.
  IF NEW.stage_id IN (5, 6) AND NOT NEW.importato THEN
    IF COALESCE(TRIM(NEW.disc_situazione), '')     = '' THEN v_mancanti := v_mancanti || 'Situazione'::text; END IF;
    IF COALESCE(TRIM(NEW.disc_problema), '')       = '' THEN v_mancanti := v_mancanti || 'Problema'::text; END IF;
    IF COALESCE(TRIM(NEW.disc_impatto), '')        = '' THEN v_mancanti := v_mancanti || 'Impatto'::text; END IF;
    IF COALESCE(TRIM(NEW.disc_obiettivo), '')      = '' THEN v_mancanti := v_mancanti || 'Obiettivo'::text; END IF;
    IF COALESCE(TRIM(NEW.disc_timing), '')         = '' THEN v_mancanti := v_mancanti || 'Timing'::text; END IF;
    IF COALESCE(TRIM(NEW.disc_budget), '')         = '' THEN v_mancanti := v_mancanti || 'Budget'::text; END IF;
    IF COALESCE(TRIM(NEW.disc_decision_maker), '') = '' THEN v_mancanti := v_mancanti || 'Decision maker'::text; END IF;

    IF array_length(v_mancanti, 1) > 0 THEN
      RAISE EXCEPTION 'Completa la discovery prima di preparare la proposta: mancano %',
        array_to_string(v_mancanti, ', ') USING ERRCODE = 'PT400';
    END IF;
  END IF;

  -- ── V4 / V5 esito ───────────────────────────────────────
  IF NEW.esito IS NOT NULL AND NEW.stage_id < 7 THEN
    RAISE EXCEPTION 'Per registrare un esito porta l''opportunità allo stage Esito'
      USING ERRCODE = 'PT400';
  END IF;

  IF NEW.esito = 'lost' AND NEW.motivo_lost IS NULL THEN
    RAISE EXCEPTION 'Indica il motivo della perdita' USING ERRCODE = 'PT400';
  END IF;

  IF NEW.esito = 'nurture' THEN
    IF NEW.data_ripresa IS NULL THEN
      RAISE EXCEPTION 'Indica quando riprendere il contatto' USING ERRCODE = 'PT400';
    END IF;
    -- La data deve essere futura solo nel momento in cui si mette in nurture:
    -- un nurture di tre mesi fa resta modificabile.
    IF (TG_OP = 'INSERT' OR OLD.esito IS DISTINCT FROM 'nurture')
       AND NEW.data_ripresa <= CURRENT_DATE THEN
      RAISE EXCEPTION 'Indica quando riprendere il contatto: la data deve essere futura'
        USING ERRCODE = 'PT400';
    END IF;
  END IF;

  -- ── V6 canone concordato prima del contratto ────────────
  IF NEW.stage_id >= 8 AND NEW.canone_proposto IS NULL AND NOT NEW.importato THEN
    RAISE EXCEPTION 'Indica il canone concordato' USING ERRCODE = 'PT400';
  END IF;

  -- ── V7 la regola più importante della specifica ─────────
  SELECT is_aperto INTO v_aperto FROM crm_stage WHERE id = NEW.stage_id;
  IF COALESCE(v_aperto, false) AND NEW.esito IS NULL THEN
    IF COALESCE(TRIM(NEW.prossima_azione), '') = '' OR NEW.data_prossima_azione IS NULL THEN
      RAISE EXCEPTION 'Ogni opportunità aperta deve avere una prossima azione con data'
        USING ERRCODE = 'PT400';
    END IF;
  END IF;

  -- ── V9 soglia minima di canone ──────────────────────────
  -- auth.uid() nullo = sta scrivendo il server (job, webhook, import): la
  -- soglia è un controllo sulle persone, non sui processi.
  SELECT crm_soglia_canone_minimo INTO v_soglia FROM company_settings WHERE id;
  IF COALESCE(v_soglia, 0) > 0
     AND NEW.canone_proposto IS NOT NULL
     AND NEW.canone_proposto < v_soglia
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Canone sotto soglia: richiede approvazione CEO' USING ERRCODE = 'PT400';
  END IF;

  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- 12. Storico stage scritto dal database (§3.5)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.crm_log_stage()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_utente UUID;
BEGIN
  -- auth.uid() può essere un cliente del portale o nullo (job, import): in
  -- quel caso la riga la si attribuisce a chi ha creato l'opportunità,
  -- altrimenti la FK su profiles salterebbe.
  SELECT id INTO v_utente FROM profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO crm_stage_log (deal_id, stage_da, stage_a, utente_id)
    VALUES (NEW.id, NULL, NEW.stage_id, COALESCE(v_utente, NEW.created_by));
  ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO crm_stage_log (deal_id, stage_da, stage_a, utente_id)
    VALUES (NEW.id, OLD.stage_id, NEW.stage_id, COALESCE(v_utente, NEW.created_by));
  END IF;

  RETURN NULL;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- 13. Ponte con la colonna `stage` vecchia
-- ════════════════════════════════════════════════════════════
-- La /direzione, il webhook del form contatti e il cron adv-leads leggono
-- ancora `deals.stage` (l'enum a 5 valori). Finché non passano a stage_id,
-- questo trigger tiene la colonna vecchia allineata: nessuno di quei pezzi
-- si accorge del cambio, e gli indici parziali che filtrano su `stage`
-- restano validi.
-- Da rimuovere quando l'ultimo consumatore sarà migrato.

CREATE OR REPLACE FUNCTION public.crm_allinea_stage_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.stage := (CASE
    WHEN NEW.stage_id IN (0, 1)    THEN 'lead'
    WHEN NEW.stage_id IN (2, 3, 4) THEN 'qualified'
    WHEN NEW.stage_id = 5          THEN 'proposal'
    WHEN NEW.stage_id = 6          THEN 'negotiation'
    WHEN NEW.stage_id = 7          THEN CASE NEW.esito
                                          WHEN 'won'  THEN 'closed_won'
                                          -- nurture: per chi legge il modello
                                          -- vecchio non è una trattativa viva
                                          ELSE 'closed_lost'
                                        END
    ELSE 'closed_won'   -- 8 contratto, 9 onboarding: vinte a tutti gli effetti
  END)::deal_stage;

  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- 14. Aggancio dei trigger
-- ════════════════════════════════════════════════════════════
-- I BEFORE scattano in ordine alfabetico di nome: crm_1 (allineamento
-- legacy) -> crm_2 (lead score) -> crm_3 (validazioni) -> set_deals_updated_at
-- -> trg_update_deal_probability. La probabilità legacy continua così a
-- vedere lo stage già allineato.

DROP TRIGGER IF EXISTS crm_1_allinea_stage_legacy ON deals;
CREATE TRIGGER crm_1_allinea_stage_legacy
  BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_allinea_stage_legacy();

DROP TRIGGER IF EXISTS crm_2_lead_score ON deals;
CREATE TRIGGER crm_2_lead_score
  BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_calcola_lead_score();

DROP TRIGGER IF EXISTS crm_3_valida ON deals;
CREATE TRIGGER crm_3_valida
  BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_valida_deal();

DROP TRIGGER IF EXISTS crm_4_log_stage ON deals;
CREATE TRIGGER crm_4_log_stage
  AFTER INSERT OR UPDATE OF stage_id ON deals
  FOR EACH ROW EXECUTE FUNCTION public.crm_log_stage();

-- Il vecchio log dei cambi stage scriveva su deal_activities, che da oggi è
-- ferma: lo storico vero è crm_stage_log e non serve tenerne due.
DROP TRIGGER IF EXISTS trg_log_deal_stage_change ON deals;


-- ════════════════════════════════════════════════════════════
-- 15. Indici (§3.7)
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_deals_stage_id      ON deals(stage_id) WHERE esito IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_owner_azione  ON deals(owner_id, data_prossima_azione);
CREATE INDEX IF NOT EXISTS idx_deals_source_v2     ON deals(source);
CREATE INDEX IF NOT EXISTS idx_deals_ripresa       ON deals(data_ripresa) WHERE esito = 'nurture';
CREATE INDEX IF NOT EXISTS idx_deals_fermo         ON deals(flag_fermo) WHERE flag_fermo;
CREATE INDEX IF NOT EXISTS idx_stagelog_deal       ON crm_stage_log(deal_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_stagelog_arrivo     ON crm_stage_log(stage_a, changed_at);
CREATE INDEX IF NOT EXISTS idx_attivita_owner_due  ON crm_attivita(owner_id, due_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attivita_deal       ON crm_attivita(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attivita_sequenza   ON crm_attivita(deal_id, sequenza) WHERE stato = 'aperta';

-- Idempotenza dei job: la stessa chiave non può essere creata due volte
-- sulla stessa opportunità (§8.1).
CREATE UNIQUE INDEX IF NOT EXISTS idx_attivita_chiave_job
  ON crm_attivita(deal_id, chiave_job) WHERE chiave_job IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- 16. RLS
-- ════════════════════════════════════════════════════════════
-- Stessa regola già in vigore su deals dalla 20260722: la pipeline
-- commerciale la vede chi è admin o chi ha l'opportunità in mano.
-- I ruoli Sales Ops / delivery della §9 non esistono ancora nell'enum
-- user_role: il modulo nasce admin-only per decisione del referente.

ALTER TABLE crm_stage           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_score_pesi ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_stage_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_attivita        ENABLE ROW LEVEL SECURITY;

-- Lookup: leggibili da chi ha accesso al CRM, modificabili dagli admin.
DROP POLICY IF EXISTS "Stage in lettura" ON crm_stage;
CREATE POLICY "Stage in lettura" ON crm_stage
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "Stage gestiti dagli admin" ON crm_stage;
CREATE POLICY "Stage gestiti dagli admin" ON crm_stage
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Pesi in lettura" ON crm_lead_score_pesi;
CREATE POLICY "Pesi in lettura" ON crm_lead_score_pesi
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "Pesi gestiti dagli admin" ON crm_lead_score_pesi;
CREATE POLICY "Pesi gestiti dagli admin" ON crm_lead_score_pesi
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Storico stage: sola lettura per chi vede l'opportunità. Nessuna policy di
-- scrittura: lo storico lo scrive solo il trigger.
DROP POLICY IF EXISTS "Storico stage in lettura" ON crm_stage_log;
CREATE POLICY "Storico stage in lettura" ON crm_stage_log
  FOR SELECT TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = crm_stage_log.deal_id
        AND (d.owner_id = (SELECT auth.uid()) OR d.created_by = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Attività in lettura" ON crm_attivita;
CREATE POLICY "Attività in lettura" ON crm_attivita
  FOR SELECT TO authenticated USING (
    public.is_admin() OR owner_id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = crm_attivita.deal_id
        AND (d.owner_id = (SELECT auth.uid()) OR d.created_by = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Attività gestite da chi ha la trattativa" ON crm_attivita;
CREATE POLICY "Attività gestite da chi ha la trattativa" ON crm_attivita
  FOR ALL TO authenticated USING (
    public.is_admin() OR owner_id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = crm_attivita.deal_id
        AND (d.owner_id = (SELECT auth.uid()) OR d.created_by = (SELECT auth.uid()))
    )
  ) WITH CHECK (
    public.is_admin() OR owner_id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = crm_attivita.deal_id
        AND (d.owner_id = (SELECT auth.uid()) OR d.created_by = (SELECT auth.uid()))
    )
  );

NOTIFY pgrst, 'reload schema';
