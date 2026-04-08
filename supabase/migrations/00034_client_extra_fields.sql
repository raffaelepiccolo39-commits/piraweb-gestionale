-- Add extra info fields to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS service_types text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS relationship_start date;
