-- ============================================================
-- Modulo AI Act (Reg. UE 2024/1689 mod. da Reg. UE 2026/1744)
-- ============================================================
--
-- Traduzione su Supabase dello schema della specifica (scritto per Prisma):
--   enum Prisma       -> enum Postgres
--   model             -> tabella con prefisso ai_ / training_
--   User              -> profiles(id)   (uuid = auth.users.id)
--   Cliente           -> clients(id)
--   cuid()            -> gen_random_uuid()
--   @db.Text          -> text
--
-- RLS (come da §6 della specifica):
--   - il TEAM (is_staff) legge il registro;
--   - solo gli ADMIN (is_admin) gestiscono sistemi, moduli e documenti;
--   - ciascuno gestisce la PROPRIA formazione e le proprie accettazioni;
--   - le generazioni le scrive il logger server-side con service role
--     (come error_logs/perf_logs): nessuna policy INSERT pubblica.
-- ============================================================

-- ── Enum ────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE ai_role AS ENUM ('DEPLOYER','PROVIDER','ENTRAMBI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_risk AS ENUM ('MINIMO','LIMITATO','ALTO','VIETATO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_output_type AS ENUM ('TESTO','IMMAGINE','VIDEO','AUDIO','CODICE','DATI'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_label_outcome AS ENUM ('NON_RICHIESTA','RICHIESTA_DEEPFAKE','RICHIESTA_TESTO_INTERESSE_PUBBLICO','ESENTE_REVISIONE_EDITORIALE','ESENTE_OPERA_CREATIVA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_document_type AS ENUM ('POLICY_INTERNA','ADDENDUM_CLIENTE','INFORMATIVA_UTENTI','VALUTAZIONE_RISCHIO','ATTESTATO_FORMAZIONE','DOSSIER_CONFORMITA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_training_status AS ENUM ('DA_EROGARE','EROGATA','PRESA_VISIONE','SCADUTA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. Registro sistemi di IA ───────────────────────────────
CREATE TABLE IF NOT EXISTS ai_systems (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT NOT NULL,
  fornitore           TEXT NOT NULL,
  versione            TEXT,
  finalita            TEXT NOT NULL,
  descrizione_uso     TEXT NOT NULL,

  ruolo_pira_web      ai_role NOT NULL,
  classif_rischio     ai_risk NOT NULL DEFAULT 'LIMITATO',
  motivazione_rischio TEXT,               -- perché non è alto rischio

  dati_personali      BOOLEAN NOT NULL DEFAULT false,
  categorie_dati      TEXT,
  dati_art9           BOOLEAN NOT NULL DEFAULT false,  -- categorie particolari GDPR
  base_giuridica      TEXT,

  output_pubblicato   BOOLEAN NOT NULL DEFAULT false,
  richiede_disclosure BOOLEAN NOT NULL DEFAULT false,  -- chatbot / sistemi interattivi

  responsabile_id     UUID NOT NULL REFERENCES profiles(id),

  url_doc_fornitore   TEXT,
  url_dpa             TEXT,
  training_opt_out    BOOLEAN NOT NULL DEFAULT false,

  attivo              BOOLEAN NOT NULL DEFAULT true,
  data_attivazione    DATE NOT NULL,
  data_dismissione    DATE,
  data_ultima_revisione DATE,
  note                TEXT,

  -- Coerenza normativa: un sistema VIETATO (art. 5) non può risultare attivo.
  CONSTRAINT ai_systems_vietato_non_attivo CHECK (NOT (classif_rischio = 'VIETATO' AND attivo)),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_systems_attivo_ruolo ON ai_systems(attivo, ruolo_pira_web);

-- ── 2. Log delle generazioni ────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_generations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id          UUID NOT NULL REFERENCES ai_systems(id),
  modello             TEXT NOT NULL,
  tipo_output         ai_output_type NOT NULL,

  -- Il prompt NON si salva in chiaro: solo hash + eventuale sintesi sanificata.
  prompt_hash         TEXT NOT NULL,
  prompt_sintesi      VARCHAR(200),
  token_input         INTEGER,
  token_output        INTEGER,

  output_ref          TEXT,
  output_hash         TEXT,

  utente_id           UUID NOT NULL REFERENCES profiles(id),
  cliente_id          UUID REFERENCES clients(id),
  progetto            TEXT,

  esito_etichetta     ai_label_outcome NOT NULL DEFAULT 'NON_RICHIESTA',
  regola_applicata    TEXT,
  etichetta_applicata BOOLEAN NOT NULL DEFAULT false,
  testo_etichetta     TEXT,

  revisione_umana     BOOLEAN NOT NULL DEFAULT false,
  revisore_id         UUID REFERENCES profiles(id),
  data_revisione      TIMESTAMPTZ,
  note_revisione      TEXT,

  pubblicato          BOOLEAN NOT NULL DEFAULT false,
  data_pubblicazione  TIMESTAMPTZ,
  canale_pubblicazione TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_gen_cliente ON ai_generations(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gen_utente ON ai_generations(utente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_gen_etichetta ON ai_generations(esito_etichetta, pubblicato);

-- ── 3. Sistemi collegati a un cliente ───────────────────────
CREATE TABLE IF NOT EXISTS client_ai_systems (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sistema_id       UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  addendum_firmato BOOLEAN NOT NULL DEFAULT false,
  data_firma       TIMESTAMPTZ,
  UNIQUE (cliente_id, sistema_id)
);

-- ── 4. Moduli di formazione (art. 4 — alfabetizzazione) ─────
CREATE TABLE IF NOT EXISTS ai_training_modules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titolo        TEXT NOT NULL,
  descrizione   TEXT NOT NULL,
  contenuto_url TEXT,
  durata_minuti INTEGER NOT NULL,
  validita_mesi INTEGER NOT NULL DEFAULT 12,
  obbligatorio  BOOLEAN NOT NULL DEFAULT true,
  attivo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Sessioni di formazione ───────────────────────────────
CREATE TABLE IF NOT EXISTS ai_training_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id        UUID NOT NULL REFERENCES ai_training_modules(id) ON DELETE CASCADE,
  utente_id        UUID NOT NULL REFERENCES profiles(id),

  stato            ai_training_status NOT NULL DEFAULT 'DA_EROGARE',
  data_erogazione  TIMESTAMPTZ,
  durata_effettiva INTEGER,
  esito_quiz       INTEGER,                 -- 0-100
  presa_visione    TIMESTAMPTZ,
  ip_presa_visione TEXT,
  user_agent       TEXT,

  scadenza         TIMESTAMPTZ,
  attestato_url    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (modulo_id, utente_id, data_erogazione)
);
CREATE INDEX IF NOT EXISTS idx_ai_training_utente ON ai_training_sessions(utente_id, stato);

-- ── 6. Documenti (policy, addendum, informative, dossier) ───
CREATE TABLE IF NOT EXISTS ai_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          ai_document_type NOT NULL,
  titolo        TEXT NOT NULL,
  versione      TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_hash     TEXT NOT NULL,
  data_vigore   DATE NOT NULL,
  data_scadenza DATE,

  cliente_id    UUID REFERENCES clients(id),   -- null = documento interno

  vigente       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_documents_tipo ON ai_documents(tipo, vigente);

-- ── 7. Accettazioni dei documenti ───────────────────────────
CREATE TABLE IF NOT EXISTS ai_document_acceptances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id      UUID NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
  utente_id         UUID NOT NULL REFERENCES profiles(id),
  data_accettazione TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip                TEXT,
  UNIQUE (documento_id, utente_id)
);

-- ── Trigger updated_at ──────────────────────────────────────
DROP TRIGGER IF EXISTS set_ai_systems_updated_at ON ai_systems;
CREATE TRIGGER set_ai_systems_updated_at BEFORE UPDATE ON ai_systems
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_ai_training_sessions_updated_at ON ai_training_sessions;
CREATE TRIGGER set_ai_training_sessions_updated_at BEFORE UPDATE ON ai_training_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE ai_systems              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_ai_systems       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_modules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_document_acceptances ENABLE ROW LEVEL SECURITY;

-- Registro sistemi: team legge, admin gestisce
DROP POLICY IF EXISTS ai_systems_read ON ai_systems;
CREATE POLICY ai_systems_read ON ai_systems FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS ai_systems_write ON ai_systems;
CREATE POLICY ai_systems_write ON ai_systems FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Generazioni: team legge; la scrittura la fa il logger con service role
-- (nessuna policy INSERT). Revisione/pubblicazione: aggiornabili dal team.
DROP POLICY IF EXISTS ai_generations_read ON ai_generations;
CREATE POLICY ai_generations_read ON ai_generations FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS ai_generations_update ON ai_generations;
CREATE POLICY ai_generations_update ON ai_generations FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS ai_generations_delete ON ai_generations;
CREATE POLICY ai_generations_delete ON ai_generations FOR DELETE TO authenticated USING (public.is_admin());

-- Sistemi per cliente: team legge, admin gestisce
DROP POLICY IF EXISTS client_ai_systems_read ON client_ai_systems;
CREATE POLICY client_ai_systems_read ON client_ai_systems FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS client_ai_systems_write ON client_ai_systems;
CREATE POLICY client_ai_systems_write ON client_ai_systems FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Moduli di formazione: team legge, admin gestisce
DROP POLICY IF EXISTS ai_training_modules_read ON ai_training_modules;
CREATE POLICY ai_training_modules_read ON ai_training_modules FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS ai_training_modules_write ON ai_training_modules;
CREATE POLICY ai_training_modules_write ON ai_training_modules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Sessioni: ciascuno vede e completa le PROPRIE; l'admin vede tutte e assegna.
DROP POLICY IF EXISTS ai_training_sessions_read ON ai_training_sessions;
CREATE POLICY ai_training_sessions_read ON ai_training_sessions FOR SELECT TO authenticated
  USING (public.is_admin() OR utente_id = auth.uid());
DROP POLICY IF EXISTS ai_training_sessions_insert ON ai_training_sessions;
CREATE POLICY ai_training_sessions_insert ON ai_training_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS ai_training_sessions_update ON ai_training_sessions;
CREATE POLICY ai_training_sessions_update ON ai_training_sessions FOR UPDATE TO authenticated
  USING (public.is_admin() OR utente_id = auth.uid())
  WITH CHECK (public.is_admin() OR utente_id = auth.uid());

-- Documenti: team legge, admin gestisce
DROP POLICY IF EXISTS ai_documents_read ON ai_documents;
CREATE POLICY ai_documents_read ON ai_documents FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS ai_documents_write ON ai_documents;
CREATE POLICY ai_documents_write ON ai_documents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Accettazioni: ciascuno accetta per sé; admin vede tutto.
DROP POLICY IF EXISTS ai_doc_acceptances_read ON ai_document_acceptances;
CREATE POLICY ai_doc_acceptances_read ON ai_document_acceptances FOR SELECT TO authenticated
  USING (public.is_admin() OR utente_id = auth.uid());
DROP POLICY IF EXISTS ai_doc_acceptances_insert ON ai_document_acceptances;
CREATE POLICY ai_doc_acceptances_insert ON ai_document_acceptances FOR INSERT TO authenticated
  WITH CHECK (utente_id = auth.uid());

NOTIFY pgrst, 'reload schema';
