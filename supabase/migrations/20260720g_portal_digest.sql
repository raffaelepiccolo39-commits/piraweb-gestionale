-- ============================================================
-- Avviso al cliente: quando c'è materiale da approvare
-- ============================================================
--
-- Un portale che il cliente deve ricordarsi di aprire non viene aperto.
-- Serve un avviso, ma senza diventare molesto: NON un'email per ogni post
-- (dieci contenuti pianificati = dieci email), bensì un riepilogo
-- giornaliero, e solo se c'è qualcosa che il cliente non ha già visto.
--
-- Questa colonna è ciò che distingue "ha materiale in attesa" da "ha
-- materiale NUOVO in attesa": senza, il cron riproporrebbe ogni giorno gli
-- stessi contenuti finché il cliente non risponde, che è il modo più veloce
-- per farsi ignorare.
-- ============================================================

ALTER TABLE client_portal_users
  ADD COLUMN IF NOT EXISTS last_digest_at TIMESTAMPTZ;

COMMENT ON COLUMN client_portal_users.last_digest_at IS
  'Ultimo riepilogo inviato. Il cron avvisa solo se esistono contenuti da approvare aggiornati DOPO questa data.';

NOTIFY pgrst, 'reload schema';
