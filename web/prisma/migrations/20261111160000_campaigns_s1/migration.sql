-- Campaigns slice 1 (docs/proposals/2026-11-11-prospects-and-campaigns.md v2.4, Áron approved the build 2026-11-11).
-- Additive only: nullable or defaulted columns on campaigns, two new tables. No existing row changes meaning:
-- the one existing campaign gets status 'draft', daily_cap 15, kind NULL (= a pre-v2 marketing row), and nothing
-- reads status for content or outreach flows.
--
-- Rollback (in this order):
--   DROP TABLE "campaign_events";
--   DROP TABLE "campaign_members";
--   DROP TABLE "campaign_steps";
--   ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_owner_user_id_fkey", DROP CONSTRAINT "campaigns_approved_by_id_fkey",
--     DROP COLUMN "kind", DROP COLUMN "status", DROP COLUMN "daily_cap", DROP COLUMN "owner_user_id",
--     DROP COLUMN "starts_on", DROP COLUMN "ends_on", DROP COLUMN "brief", DROP COLUMN "brief_proposal",
--     DROP COLUMN "audience", DROP COLUMN "approved_by_id", DROP COLUMN "approved_at", DROP COLUMN "approved_hash";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261111160000_campaigns_s1';
-- Post-apply check: web/scripts/db/verify-campaigns-s1.sql (read only).

ALTER TABLE "campaigns" ADD COLUMN "kind" TEXT,
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN "daily_cap" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "owner_user_id" INTEGER,
    ADD COLUMN "starts_on" DATE,
    ADD COLUMN "ends_on" DATE,
    ADD COLUMN "brief" JSONB,
    ADD COLUMN "brief_proposal" JSONB,
    ADD COLUMN "audience" JSONB,
    ADD COLUMN "approved_by_id" INTEGER,
    ADD COLUMN "approved_at" TIMESTAMP(3),
    ADD COLUMN "approved_hash" TEXT;
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_kind_check" CHECK ("kind" IN ('content', 'ad', 'organic', 'cold_call', 'cold_email', 'sequence')),
    ADD CONSTRAINT "campaigns_status_check" CHECK ("status" IN ('draft', 'running', 'paused', 'stopped', 'done')),
    ADD CONSTRAINT "campaigns_daily_cap_check" CHECK ("daily_cap" BETWEEN 1 AND 200);
-- No CHECK tying running to approved_by_id: the FK is ON DELETE SET NULL, so removing a user would
-- break every campaign they approved (Vanda #188-1). The service guarantees it on the way in.
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "campaign_steps" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "wait_days" INTEGER NOT NULL DEFAULT 0,
    "audience_rule" TEXT NOT NULL DEFAULT 'all',
    "content_item_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_steps_channel_check" CHECK ("channel" IN ('email', 'call', 'ad', 'post', 'dm')),
    CONSTRAINT "campaign_steps_audience_rule_check" CHECK ("audience_rule" IN ('all', 'no_reply', 'no_answer')),
    CONSTRAINT "campaign_steps_position_check" CHECK ("position" BETWEEN 1 AND 20),
    CONSTRAINT "campaign_steps_wait_days_check" CHECK ("wait_days" BETWEEN 0 AND 60)
);
CREATE UNIQUE INDEX "campaign_steps_campaign_id_position_key" ON "campaign_steps"("campaign_id", "position");
CREATE INDEX "campaign_steps_tenant_id_idx" ON "campaign_steps"("tenant_id");
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "campaign_members" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "person_id" INTEGER,
    "lead_id" INTEGER,
    "step_position" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_eligible_on" DATE,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "tier" TEXT,
    "lane" TEXT,
    "phone_only" BOOLEAN NOT NULL DEFAULT false,
    "why" TEXT,
    "city" TEXT,
    "import_batch" TEXT,
    "created_company" BOOLEAN NOT NULL DEFAULT false,
    "created_person" BOOLEAN NOT NULL DEFAULT false,
    "last_outcome" TEXT,
    "last_touched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_members_state_check" CHECK ("state" IN ('queued', 'needs_contact', 'promoted', 'declined', 'unreachable', 'excluded', 'done')),
    CONSTRAINT "campaign_members_attempts_check" CHECK ("attempts" BETWEEN 0 AND 20),
    CONSTRAINT "campaign_members_step_position_check" CHECK ("step_position" BETWEEN 1 AND 20)
    -- No CHECK "promoted implies lead_id": lead_id is ON DELETE SET NULL, and a lead may be deleted (Vanda #188-1).
);
CREATE UNIQUE INDEX "campaign_members_campaign_id_company_id_key" ON "campaign_members"("campaign_id", "company_id");
CREATE INDEX "campaign_members_tenant_id_campaign_id_state_next_eligible__idx" ON "campaign_members"("tenant_id", "campaign_id", "state", "next_eligible_on");
CREATE INDEX "campaign_members_tenant_id_campaign_id_import_batch_idx" ON "campaign_members"("tenant_id", "campaign_id", "import_batch");
CREATE INDEX "campaign_members_company_id_idx" ON "campaign_members"("company_id");
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only touch log (analytics by step and by day).
CREATE TABLE "campaign_events" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "member_id" INTEGER NOT NULL,
    "step_position" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "lead_id" INTEGER,
    "actor_user_id" INTEGER,
    "actor_agent_id" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_events_outcome_check" CHECK ("outcome" IN ('no_answer', 'interested', 'wants', 'not_interested', 'bad_number', 'note_only', 'email_sent', 'reply_positive', 'reply_negative', 'unsubscribe', 'bounce'))
);
CREATE INDEX "campaign_events_tenant_id_campaign_id_at_idx" ON "campaign_events"("tenant_id", "campaign_id", "at");
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "campaign_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
