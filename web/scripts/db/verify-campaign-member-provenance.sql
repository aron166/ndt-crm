-- Post-apply check for 20261111220000_campaign_member_provenance. READ ONLY. Every row must say ok = true.
-- Run: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f web/scripts/db/verify-campaign-member-provenance.sql
BEGIN READ ONLY;
SELECT 'migration recorded' AS check, count(*) = 1 AS ok
  FROM "_prisma_migrations" WHERE "migration_name" = '20261111220000_campaign_member_provenance' AND "finished_at" IS NOT NULL
UNION ALL
SELECT 'campaign_members has 3 new nullable text columns', count(*) = 3
  FROM information_schema.columns WHERE table_name = 'campaign_members' AND column_name IN ('segment', 'source', 'contact_source')
  AND is_nullable = 'YES' AND data_type = 'text' AND column_default IS NULL
UNION ALL
SELECT 'no value written by the migration', NOT EXISTS (SELECT 1 FROM "campaign_members" WHERE "segment" IS NOT NULL OR "source" IS NOT NULL OR "contact_source" IS NOT NULL);
ROLLBACK;
