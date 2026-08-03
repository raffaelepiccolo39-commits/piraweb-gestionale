-- Mezza giornata: quale metà.
--
-- Finora la richiesta diceva solo "mezza giornata": chi deve organizzare il
-- lavoro non sapeva se la persona c'e' la mattina o il pomeriggio, e doveva
-- chiederlo a voce — che e' esattamente il tipo di domanda che un gestionale
-- dovrebbe togliere di mezzo.
--
-- Due colonne nuove, una per il primo giorno e una per l'ultimo, perche' una
-- richiesta lunga puo' avere mezza giornata a un capo, all'altro o a
-- entrambi. Restano libere di essere vuote: le richieste gia' inserite non
-- hanno l'informazione e non se la puo' inventare nessuno. Per quelle
-- l'etichetta resta "mezza giornata", come prima.

ALTER TABLE time_off_requests
  ADD COLUMN IF NOT EXISTS start_half_period TEXT,
  ADD COLUMN IF NOT EXISTS end_half_period TEXT;

-- Solo due valori possibili. Il vincolo accetta anche il vuoto: e' il caso
-- delle giornate intere e dello storico.
ALTER TABLE time_off_requests
  DROP CONSTRAINT IF EXISTS time_off_start_half_period_valido;
ALTER TABLE time_off_requests
  ADD CONSTRAINT time_off_start_half_period_valido
  CHECK (start_half_period IS NULL OR start_half_period IN ('mattina', 'pomeriggio'));

ALTER TABLE time_off_requests
  DROP CONSTRAINT IF EXISTS time_off_end_half_period_valido;
ALTER TABLE time_off_requests
  ADD CONSTRAINT time_off_end_half_period_valido
  CHECK (end_half_period IS NULL OR end_half_period IN ('mattina', 'pomeriggio'));

-- ── Il calendario assenze deve poter dire quale meta' ──
--
-- La funzione che alimenta il calendario del team restituisce un elenco di
-- colonne fisso: finche' non si aggiungono le due nuove, il calendario non
-- puo' mostrarle nemmeno se ci sono nella tabella.
--
-- Serve DROP prima di CREATE: cambiare le colonne restituite da una funzione
-- non e' una sostituzione, e Postgres si ferma (42P13). Le regole di privacy
-- sulla malattia restano identiche.

DROP FUNCTION IF EXISTS get_team_absences(DATE, DATE);

CREATE FUNCTION get_team_absences(p_from DATE, p_to DATE)
RETURNS TABLE (
  request_id UUID, user_id UUID, full_name TEXT, color TEXT,
  type time_off_type, start_date DATE, end_date DATE,
  start_half BOOLEAN, end_half BOOLEAN, total_days NUMERIC,
  start_half_period TEXT, end_half_period TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.user_id, p.full_name, p.color, r.type,
         r.start_date, r.end_date, r.start_half, r.end_half, r.total_days,
         r.start_half_period, r.end_half_period
  FROM time_off_requests r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.status = 'approved'
    AND r.end_date >= p_from
    AND r.start_date <= p_to
    AND (
      r.type <> 'malattia'
      OR auth.uid() = r.user_id
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  ORDER BY r.start_date, p.full_name;
$$;

NOTIFY pgrst, 'reload schema';
