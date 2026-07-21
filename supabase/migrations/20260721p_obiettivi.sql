-- ============================================================
-- Obiettivi: trimestrali, semestrali, annuali
-- ============================================================
--
-- Il portale finora racconta il mese: contenuti, rate, lavorazioni. Manca la
-- cosa che tiene insieme i mesi — dove stiamo andando. Senza, il rapporto si
-- misura a post pubblicati, che è il metro peggiore per entrambi: il cliente
-- conta i pezzi e noi difendiamo la quantità invece del risultato.
--
-- Gli obiettivi li scriviamo NOI e il cliente li legge: non sono una lista di
-- desideri che compila lui, sono quello che ci siamo detti di raggiungere.
-- Per proporre idee c'è il diario.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE obiettivo_periodo AS ENUM ('trimestrale', 'semestrale', 'annuale');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  -- Volutamente senza "fallito": un obiettivo non raggiunto si chiude come
  -- "non raggiunto" e si spiega. La parola che si sceglie qui è la parola con
  -- cui se ne parlerà in riunione.
  CREATE TYPE obiettivo_stato AS ENUM ('in_corso', 'raggiunto', 'non_raggiunto');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS client_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  titolo text NOT NULL CHECK (btrim(titolo) <> ''),
  descrizione text,

  periodo obiettivo_periodo NOT NULL DEFAULT 'trimestrale',
  data_inizio date NOT NULL,
  data_fine date NOT NULL,

  stato obiettivo_stato NOT NULL DEFAULT 'in_corso',
  -- Da 0 a 100. Nullo quando l'avanzamento non si misura a percentuale
  -- (certi obiettivi o sono fatti o non sono fatti).
  progresso smallint CHECK (progresso IS NULL OR (progresso >= 0 AND progresso <= 100)),
  -- Come è andata, scritto da noi: il cliente lo legge insieme allo stato.
  esito text,

  -- Come per i materiali: nasce interno e si mostra quando è pronto.
  pubblicato boolean NOT NULL DEFAULT false,

  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT periodo_coerente CHECK (data_fine >= data_inizio)
);

CREATE INDEX IF NOT EXISTS idx_client_objectives_cliente
  ON client_objectives(client_id, data_fine DESC);

-- La funzione si chiama update_updated_at(): e' quella usata da tutte le
-- altre 63 tabelle del progetto. Avevo scritto update_updated_at_column(),
-- che e' il nome dell'esempio nella documentazione di Supabase ma non esiste
-- qui — ed e' l'errore che faceva fallire tutta la migration.
DROP TRIGGER IF EXISTS set_client_objectives_updated_at ON client_objectives;
CREATE TRIGGER set_client_objectives_updated_at
  BEFORE UPDATE ON client_objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_objectives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Il team gestisce gli obiettivi" ON client_objectives;
CREATE POLICY "Il team gestisce gli obiettivi" ON client_objectives
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Il cliente legge, e solo quelli pubblicati. Nessuna scrittura: gli
-- obiettivi sono un impegno preso insieme, non una lista che si modifica
-- da soli.
DROP POLICY IF EXISTS "Il cliente vede i propri obiettivi" ON client_objectives;
CREATE POLICY "Il cliente vede i propri obiettivi" ON client_objectives
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id() AND pubblicato);


-- ============================================================
-- Verifica
-- ============================================================
SELECT
  CASE WHEN to_regclass('public.client_objectives') IS NOT NULL
       THEN 'ok' ELSE 'MANCA' END AS tabella,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'client_objectives') AS quante_policy;

NOTIFY pgrst, 'reload schema';
