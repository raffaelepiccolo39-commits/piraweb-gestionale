-- ============================================================
-- Sicurezza: il bucket degli screenshot dei bug era pubblico
-- ============================================================
--
-- La 20260707c aveva reso 'dev-note-screenshots' public=true per aggirare un
-- bug (il codice usava getPublicUrl su un bucket privato e le immagini non si
-- aprivano). Effetto collaterale: ogni screenshot — che puo' ritrarre schede
-- cliente con IBAN, importi, GPS, credenziali — era scaricabile da CHIUNQUE
-- avesse il link, senza alcun login, scavalcando la RLS di developer_notes.
--
-- Il codice ora salva il PERCORSO e genera un link firmato a scadenza al
-- momento della visualizzazione (note-dev/page.tsx), quindi il bucket torna
-- privato. La policy SELECT per gli autenticati esiste gia' dalla 00031, per
-- cui i link firmati continuano a funzionare per il team.
--
-- Nessuna nota aveva screenshot al momento del fix, quindi non ci sono URL
-- pubblici vecchi da ripulire.
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'dev-note-screenshots';
