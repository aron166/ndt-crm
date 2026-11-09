-- Data only: switch the web-form auto-reply ON for tenant 1 (Áron's go, 2026-11-09).
-- No schema change, so run it AFTER this PR's deploy is live (the personalised text
-- ships with it); before that, prod would send the plain version.
-- Rollback: UPDATE "tenants" SET "settings" = "settings" || '{"auto_reply_enabled": false}'::jsonb WHERE "id" = 1;
UPDATE "tenants"
SET "settings" = COALESCE("settings", '{}'::jsonb) || '{"auto_reply_enabled": true}'::jsonb
WHERE "id" = 1;
