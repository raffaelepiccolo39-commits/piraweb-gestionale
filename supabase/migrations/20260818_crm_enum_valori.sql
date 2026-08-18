-- ============================================================
-- CRM commerciale — passo 1: soli valori di enum
-- ============================================================
--
-- Postgres non permette di USARE un valore di enum nella stessa transazione
-- in cui lo si aggiunge. Le migration girano in transazione, quindi i nuovi
-- valori stanno qui da soli e la 20260818b li adopera.
-- Stesso motivo per cui esiste 20260707b_notification_enum_backfill.sql.
--
-- ORDINE DI ESECUZIONE: prima questo file, poi 20260818b.
-- ============================================================

-- ── Provenienza del lead (§3.2) ─────────────────────────────
-- La tassonomia della specifica è 'referral, inbound, outbound, paid,
-- partnership'. 'referral' c'era già; gli altri quattro si aggiungono a
-- deal_source. I valori vecchi (website, social_media, cold_outreach, event,
-- ads, other) restano nel tipo — Postgres non li droppa — ma la 20260818b li
-- rimappa sui nuovi e la UI smette di proporli. Stessa tecnica già usata per
-- lo stage 'qualified' nella 20260601_crm_revamp.
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'inbound';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'outbound';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'partnership';

-- ── Notifiche dei job commerciali (§8) ──────────────────────
-- Si riusa il sistema notifiche esistente (assunzione A4 verificata: c'è
-- notifications + create_notification() + push). Servono solo i tipi nuovi.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'crm_sla_violato';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'crm_opportunita_ferma';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'crm_nurture_da_riprendere';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'crm_followup_scaduto';
