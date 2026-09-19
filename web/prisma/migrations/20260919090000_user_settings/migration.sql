-- Per-user UI preferences (first use: the light/dark theme toggle).
-- One nullable JSONB column, mirroring tenants.settings. Additive and
-- reversible: ALTER TABLE users DROP COLUMN settings;
ALTER TABLE "users" ADD COLUMN "settings" JSONB;
