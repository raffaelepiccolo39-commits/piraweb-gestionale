-- Add SDI (Sistema di Interscambio) fields to invoices table for Aruba integration
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_status text DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_identifier text DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_message text DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_sent_at timestamptz DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sdi_filename text DEFAULT NULL;

-- Index for quick lookup by SDI filename
CREATE INDEX IF NOT EXISTS idx_invoices_sdi_filename ON invoices(sdi_filename) WHERE sdi_filename IS NOT NULL;
