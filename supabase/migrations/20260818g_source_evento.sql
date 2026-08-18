-- ============================================================
-- CRM — "evento" diventa una provenienza sua
-- ============================================================
--
-- La 20260818b aveva fatto confluire il vecchio valore `event` dentro
-- `partnership`, seguendo la tassonomia a cinque voci della specifica. È una
-- forzatura: una fiera dove raccogli contatti non è un accordo con un altro
-- soggetto, e non è nemmeno inbound — a quel banchetto ci sei andato tu.
-- Decisione del referente: sta da sola.
--
-- Nessun dato da rimappare: al momento di questa migration in produzione non
-- c'era nessuna riga `partnership` (verificato: 10 inbound, 2 paid). Se un
-- domani ne comparissero e fossero in realtà eventi, vanno corrette a mano —
-- dopo la fusione fatta dalla 20260818b le due cose non si distinguono più.
--
-- File a sé perché Postgres non permette di USARE un valore di enum nella
-- stessa transazione in cui lo si aggiunge. Non serve nessun seguito: qui non
-- c'è niente che quel valore debba usarlo.
-- ============================================================

ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'evento';

NOTIFY pgrst, 'reload schema';
