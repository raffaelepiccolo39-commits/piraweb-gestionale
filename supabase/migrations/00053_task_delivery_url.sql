-- Add delivery_url field to tasks for Google Drive / Figma / Canva links
-- Required when marking a task as "done" so admin can see the completed work
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delivery_url TEXT DEFAULT NULL;
