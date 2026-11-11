-- Post-apply check for 20261111160000_campaigns_s1. READ ONLY. Every row must say ok = true.
-- Run: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f web/scripts/db/verify-campaigns-s1.sql
BEGIN READ ONLY;
SELECT 'migration recorded' AS check, count(*) = 1 AS ok
  FROM "_prisma_migrations" WHERE "migration_name" = '20261111160000_campaigns_s1' AND "finished_at" IS NOT NULL
UNION ALL
SELECT 'campaigns has 12 new columns', count(*) = 12
  FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name IN
  ('kind','status','daily_cap','owner_user_id','starts_on','ends_on','brief','brief_proposal','audience','approved_by_id','approved_at','approved_hash')
UNION ALL
SELECT 'existing campaigns unchanged in meaning (draft, cap 15, kind null)', bool_and("status" = 'draft' AND "daily_cap" = 15 AND "kind" IS NULL)
  FROM "campaigns"
UNION ALL
SELECT 'campaign_steps exists and is empty', (SELECT count(*) FROM "campaign_steps") = 0
UNION ALL
SELECT 'campaign_members exists and is empty', (SELECT count(*) FROM "campaign_members") = 0
UNION ALL
SELECT 'campaign_events exists and is empty', (SELECT count(*) FROM "campaign_events") = 0
UNION ALL
SELECT 'check constraints present (4 + 4 + 4 + 1)', count(*) = 13
  FROM pg_constraint WHERE contype = 'c' AND conrelid IN ('campaigns'::regclass, 'campaign_steps'::regclass, 'campaign_members'::regclass, 'campaign_events'::regclass)
  AND conname LIKE 'campaign%';
ROLLBACK;
