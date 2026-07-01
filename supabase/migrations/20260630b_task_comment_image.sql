-- Foto nei commenti delle task.
-- image_path = path dell'oggetto nel bucket privato "attachments" (prefisso comments/).
-- Il rendering usa signed URL lato client (come per gli allegati).
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS image_path text;

NOTIFY pgrst, 'reload schema';
