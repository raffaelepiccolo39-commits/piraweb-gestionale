-- ============================================================
-- Pulizia: via le tabelle che non legge più nessuno
-- ============================================================
--
-- Inventario del 18/08/2026: 97 tabelle in produzione, 16 mai citate dal
-- codice dell'applicazione. Ma "non citata dal codice" non basta a
-- dichiararla morta — `festivita` e `recurring_tasks` sembrano tali e invece
-- le usano funzioni del database. Ognuna è stata verificata su tre fronti:
-- la usa il codice? la scrive un trigger o una funzione? contiene dati?
--
-- IRREVERSIBILE. Backup delle 101 righe interessate in
-- ~/Desktop/backup-pulizia-tabelle-2026-08-18.json — con un'eccezione
-- deliberata: la colonna `secret` di user_totp NON è nel backup. È il
-- segreto del 2FA artigianale dismesso: inutile da conservare e sbagliato
-- da scrivere in chiaro su un Desktop.
--
-- COSA RESTA, benché sembri morto:
--   festivita          la legge add_business_hours() per gli SLA del CRM
--   recurring_tasks    la usa generate_recurring_tasks(), chiamata dal cron
--   installment_logs   la scrive un trigger vivo: è la traccia dei
--                      pagamenti a rate, cioè una prova contabile
--   business_control   34 righe di piano ricavi 2026 inserite a mano.
--                      Nessun codice la legge, ma è roba del referente e
--                      resta finché non decide lui.
-- ============================================================

-- ── Chat interna ────────────────────────────────────────────
-- L'interfaccia non esiste più nel codice: 26 canali, 55 iscrizioni e 13
-- messaggi che dal 28 luglio nessuno può più leggere.
--
-- Qui serve CASCADE, e vale la pena spiegare perché — CASCADE alla cieca su
-- una pulizia è pericoloso. Le tre tabelle si tengono in ostaggio a vicenda:
-- chat_channel_members ha una chiave esterna verso chat_channels, e una
-- policy SU chat_channels interroga chat_channel_members. Nessun ordine di
-- DROP semplice le scioglie:
--
--   ERROR: 2BP01: cannot drop table chat_channel_members because other
--          objects depend on it
--   DETAIL: policy Users can view their channels on table chat_channels
--           depends on table chat_channel_members
--
-- Verificato migration per migration che TUTTI gli oggetti dipendenti siano
-- policy della chat su tabelle della chat: nessuna tabella che resta perde
-- qualcosa. Fuori da questo blocco non si usa CASCADE, proprio perché una
-- policy di una tabella superstite potrebbe citarne una in eliminazione, e
-- cadrebbe in silenzio lasciando quella tabella scoperta.

DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_channel_members CASCADE;
DROP TABLE IF EXISTS public.chat_channels CASCADE;

-- ── Resti del vecchio CRM ───────────────────────────────────
-- deal_activities: le sue 6 righe sono state migrate in crm_attivita dalla
-- 20260818b, che ha anche rimosso il trigger che la alimentava. Da allora
-- nessuno ci scrive e nessuno la legge.
-- deal_files: allegati alle trattative, mai usata (0 righe).

-- Prima il trigger, poi la funzione: Postgres non lascia cadere una
-- funzione da cui dipende un trigger. In produzione quel trigger l'ha già
-- tolto la 20260818b, ma dirlo qui rende la migration eseguibile anche su un
-- database dove quel passaggio non è ancora arrivato.
DROP TRIGGER IF EXISTS trg_log_deal_stage_change ON deals;
DROP FUNCTION IF EXISTS public.log_deal_stage_change();
DROP TABLE IF EXISTS public.deal_activities;
DROP TABLE IF EXISTS public.deal_files;

-- ── Bacheca sociale mai nata ────────────────────────────────
-- Tre tabelle vuote soppiantate da `social_posts`, che è quella vera —
-- usata in tredici file dell'applicazione.

DROP TABLE IF EXISTS public.post_reactions;
DROP TABLE IF EXISTS public.post_comments;
DROP TABLE IF EXISTS public.posts;

-- ── 2FA artigianale, dismesso ───────────────────────────────
-- Sostituito dal MFA nativo di Supabase (vedi 20260814g e i commit "2FA
-- nativa"). Nel codice resta solo citato nei commenti, che spiegano perché
-- il sistema nuovo è separato da questo.

DROP TABLE IF EXISTS public.user_totp;

-- ── Viste che nessuno interroga ─────────────────────────────

DROP VIEW IF EXISTS public.v_client_open_installments;
DROP VIEW IF EXISTS public.v_project_payment_summary;

-- ── Una tabella creata per sbaglio ──────────────────────────
-- Nome con lo spazio dentro, zero righe, e non compare in NESSUNA
-- migration: nata a mano, probabilmente da un import sbagliato.

DROP TABLE IF EXISTS public."app ufficio";

NOTIFY pgrst, 'reload schema';
