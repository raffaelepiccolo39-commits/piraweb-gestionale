-- ============================================
-- Aggiunge email ai lead e tipo agente lead_sender
-- ============================================

-- Campo email per contatto automatico
ALTER TABLE lead_prospects ADD COLUMN IF NOT EXISTS email TEXT;

-- Traccia quando e' stata inviata l'email/whatsapp
ALTER TABLE lead_prospects ADD COLUMN IF NOT EXISTS outreach_sent_at TIMESTAMPTZ;

-- Link WhatsApp pre-generato
ALTER TABLE lead_prospects ADD COLUMN IF NOT EXISTS whatsapp_link TEXT;

-- Nuovo tipo agente
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'lead_sender';
