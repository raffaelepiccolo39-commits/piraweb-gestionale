-- ============================================
-- Migration 00029: Add IBAN field to profiles
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS iban TEXT;
