-- Agregar columna para almacenar el archivo PPTX como bytes
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS ppt_data BYTEA;
ALTER TABLE reportes ADD COLUMN IF NOT EXISTS ppt_filename VARCHAR(255);
