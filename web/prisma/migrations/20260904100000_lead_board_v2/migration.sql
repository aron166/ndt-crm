-- Lead board v2 (BRIEFING_2026-09-04 Phase 1).
--
-- 1. Lead outcome (open | won | lost) orthogonal to the stage, + closed_at.
--    Phase 2 inbound-channel fields (channel, campaign) ride along (nullable).
ALTER TABLE "leads"
  ADD COLUMN "outcome"   TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "closed_at" TIMESTAMP(3),
  ADD COLUMN "channel"   TEXT,
  ADD COLUMN "campaign"  TEXT;

CREATE INDEX "leads_tenant_id_outcome_status_idx" ON "leads"("tenant_id", "outcome", "status");

-- 2. Interactions + tasks can point at the lead they belong to, so the per-lead
--    call history and the callback-due badge are exact (not inferred via
--    company/person). Nullable: pre-existing rows have no lead.
ALTER TABLE "interactions" ADD COLUMN "lead_id" INTEGER;
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "interactions_tenant_id_lead_id_idx" ON "interactions"("tenant_id", "lead_id");

ALTER TABLE "tasks" ADD COLUMN "lead_id" INTEGER;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tasks_tenant_id_lead_id_idx" ON "tasks"("tenant_id", "lead_id");

-- 3. Time-based automations can now target leads (lead_idle). deal_id becomes
--    nullable; a lead firing is deduped once per (rule, lead).
ALTER TABLE "automation_firings" ALTER COLUMN "deal_id" DROP NOT NULL;
ALTER TABLE "automation_firings" ADD COLUMN "lead_id" INTEGER;
ALTER TABLE "automation_firings" ADD CONSTRAINT "automation_firings_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "automation_firings_rule_id_lead_id_key" ON "automation_firings"("rule_id", "lead_id");

-- 4. Lead stages for tenant 1: the launch board (getting to a demo). Verified on
--    2026-09-04 that tenant 1 has ZERO leads, so the old columns are unused and
--    are replaced outright. Defensive anyway: any lead sitting in a key that is
--    not in the new set is moved to `new` first, so nothing is orphaned.
UPDATE "leads" SET "status" = 'new'
 WHERE "tenant_id" = 1
   AND ("status" IS NULL OR "status" NOT IN
        ('new','call_1','call_2','call_3','call_3_plus','recall','demo_aron','demo_peter'));

DELETE FROM "lead_statuses"
 WHERE "tenant_id" = 1
   AND "key" NOT IN ('new','call_1','call_2','call_3','call_3_plus','recall','demo_aron','demo_peter');

INSERT INTO "lead_statuses" ("tenant_id", "key", "label", "color", "position", "is_initial", "is_terminal", "is_commitment")
VALUES
  (1, 'new',         'Új',                   '#6366f1', 0, true,  false, false),
  (1, 'call_1',      '1. hívás',             '#3b82f6', 1, false, false, false),
  (1, 'call_2',      '2. hívás',             '#8b5cf6', 2, false, false, false),
  (1, 'call_3',      '3. hívás',             '#a855f7', 3, false, false, false),
  (1, 'call_3_plus', '3+ hívás',             '#f59e0b', 4, false, false, false),
  (1, 'recall',      'Visszahívás',          '#f97316', 5, false, false, false),
  (1, 'demo_aron',   'Demó foglalva (Áron)', '#22c55e', 6, false, false, false),
  (1, 'demo_peter',  'Demó foglalva (Péter)','#16a34a', 7, false, false, false)
ON CONFLICT ("tenant_id", "key") DO UPDATE
  SET "position" = EXCLUDED."position", "is_initial" = EXCLUDED."is_initial";
