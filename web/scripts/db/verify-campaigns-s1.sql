-- Post-apply check for 20261111160000_campaigns_s1. READ ONLY. Every row must say ok = true.
-- Run: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f web/scripts/db/verify-campaigns-s1.sql
BEGIN READ ONLY;
SELECT 'migration recorded' AS check, count(*) = 1 AS ok
  FROM "_prisma_migrations" WHERE "migration_name" = '20261111160000_campaigns_s1' AND "finished_at" IS NOT NULL
UNION ALL
SELECT 'campaigns has 13 new columns', count(*) = 13
  FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name IN
  ('kind','status','daily_cap','owner_user_id','starts_on','ends_on','brief','brief_proposal','audience','approved_by_id','approved_at','approved_hash','outbound_automations')
UNION ALL
SELECT 'existing campaigns unchanged in meaning (draft, cap 15, kind null, outbound off)', coalesce(bool_and("status" = 'draft' AND "daily_cap" = 15 AND "kind" IS NULL AND NOT "outbound_automations"), true)
  FROM "campaigns"
UNION ALL
SELECT 'campaign_steps exists and is empty', (SELECT count(*) FROM "campaign_steps") = 0
UNION ALL
SELECT 'campaign_members exists and is empty', (SELECT count(*) FROM "campaign_members") = 0
UNION ALL
SELECT 'campaign_events exists and is empty', (SELECT count(*) FROM "campaign_events") = 0
UNION ALL
SELECT 'check constraints present (3 + 4 + 3 + 1)', count(*) = 11
  FROM pg_constraint WHERE contype = 'c' AND conrelid IN ('campaigns'::regclass, 'campaign_steps'::regclass, 'campaign_members'::regclass, 'campaign_events'::regclass)
  AND conname LIKE 'campaign%'
UNION ALL
SELECT 'member state CHECK allows needs_email', bool_or(pg_get_constraintdef(oid) LIKE '%needs_email%')
  FROM pg_constraint WHERE conname = 'campaign_members_state_check'
UNION ALL
SELECT 'no phone_only column (e-mail first for everyone)', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaign_members' AND column_name = 'phone_only');
ROLLBACK;
