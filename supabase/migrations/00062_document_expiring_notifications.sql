-- ============================================
-- Migration 00062: Tipo notifica per documenti in scadenza
-- ============================================
-- Estende notification_type con un evento dedicato per il cron di
-- /api/cron/expiring-documents (avviso a 30/7/0 giorni dalla scadenza).

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'document_expiring';

NOTIFY pgrst, 'reload schema';
