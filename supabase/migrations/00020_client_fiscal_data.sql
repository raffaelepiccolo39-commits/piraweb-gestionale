-- ============================================
-- Migration 00020: Dati fiscali clienti
-- ============================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS ragione_sociale TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS partita_iva TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS codice_sdi TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pec TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS indirizzo TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS citta TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS provincia TEXT;
