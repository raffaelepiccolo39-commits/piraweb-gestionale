-- Backfill valori enum notification_type mancanti in produzione.
-- Le migration 00059 (time_off) e 00062 (document_expiring) non erano state
-- applicate: l'approvazione ferie falliva la notifica al dipendente con
-- "invalid input value for enum notification_type: time_off_approved".
-- ADD VALUE IF NOT EXISTS è idempotente.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'time_off_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'time_off_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'document_expiring';
