-- ============================================
-- Migration 00016: Employee contract fields on profiles
-- ============================================

DO $$ BEGIN CREATE TYPE employee_contract_type AS ENUM ('6_mesi', '12_mesi', 'indeterminato'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salary NUMERIC(10, 2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_type employee_contract_type;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_start_date DATE;
