-- ============================================
-- Migration 00010: Seed Data
-- ============================================
-- NOTE: This seed creates the team profiles.
-- Users must be created via Supabase Auth first (Dashboard or API).
-- After auth user creation, profiles are auto-created by trigger.
-- Use these UPDATE statements to set the correct roles and names.
--
-- Team members to create in Supabase Auth Dashboard:
-- 1. info@piraweb.it (password: changeme123!)
-- 2. bernis@piraweb.it (password: changeme123!)
-- 3. manuela@piraweb.it (password: changeme123!)
-- 4. raffaela@piraweb.it (password: changeme123!)
-- 5. gaia@piraweb.it (password: changeme123!)
--
-- After creating users in Auth, run these updates:

-- Alternative: Use this function to set up team after auth users are created
CREATE OR REPLACE FUNCTION setup_team_roles()
RETURNS void AS $$
BEGIN
  UPDATE profiles SET full_name = 'Raffaele Antonio Piccolo', role = 'admin'
  WHERE email = 'info@piraweb.it';

  UPDATE profiles SET full_name = 'Bernis Del Villano', role = 'social_media_manager'
  WHERE email = 'bernis@piraweb.it';

  UPDATE profiles SET full_name = 'Manuela Del Villano', role = 'content_creator'
  WHERE email = 'manuela@piraweb.it';

  UPDATE profiles SET full_name = 'Raffaela Sparaco', role = 'graphic_social'
  WHERE email = 'raffaela@piraweb.it';

  UPDATE profiles SET full_name = 'Gaia Coppeto', role = 'graphic_brand'
  WHERE email = 'gaia@piraweb.it';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sample client data (will be inserted by admin)
-- This creates a function admin can call after setup
CREATE OR REPLACE FUNCTION seed_sample_clients(p_admin_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO clients (name, company, email, phone, website, notes, created_by)
  VALUES
    ('Mario Rossi', 'Rossi & Partners', 'mario@rossipartners.it', '+39 081 1234567', 'https://rossipartners.it', 'Cliente storico, settore legale', p_admin_id),
    ('Lucia Bianchi', 'Bianchi Fashion', 'lucia@bianchifashion.it', '+39 02 9876543', 'https://bianchifashion.it', 'Brand di moda emergente', p_admin_id),
    ('Giuseppe Verde', 'Verde Ristorazione', 'info@verderistorante.it', '+39 06 5551234', 'https://verderistorante.it', 'Catena di ristoranti campani', p_admin_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
