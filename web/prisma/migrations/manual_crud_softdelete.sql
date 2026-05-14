-- Soft-delete support for companies and persons
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE persons   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
