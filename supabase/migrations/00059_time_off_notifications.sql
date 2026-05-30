-- ============================================
-- Migration 00059: Tipi notifica per Ferie & Permessi
-- ============================================
-- Estende l'enum notification_type con i due eventi del modulo time-off
-- così possiamo avvisare il dipendente quando una richiesta viene approvata
-- o rifiutata.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'time_off_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'time_off_rejected';

NOTIFY pgrst, 'reload schema';
