-- Add color field to profiles for user identification
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS color text DEFAULT '#8c7af5';
