-- Add business sector field to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sector text;
