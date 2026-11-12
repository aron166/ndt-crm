-- Scoped app keys (night 2026-11-12, plan item 9). Space-separated scope list: leads:write, prospects:write, read.
-- NULL = a legacy key with today's behaviour on every app-key route, so nothing changes at deploy. A key with
-- scopes reaches only the routes those scopes name (lib/app-key-auth.ts). One nullable column, no data change.
-- Rollback (every key returns to legacy behaviour):
--   ALTER TABLE "app_api_keys" DROP COLUMN "scopes";
ALTER TABLE "app_api_keys" ADD COLUMN IF NOT EXISTS "scopes" TEXT;
