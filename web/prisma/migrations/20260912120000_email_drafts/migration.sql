-- Outreach queue (BRIEFING_2026-09-04 addendum, item 1).
-- One row = one touch of a 4-touch cold-email sequence for one company in one
-- campaign. Drafted by an external agent skill, approved by a human in
-- /outreach, sent through the tenant's existing Resend integration.
--
-- Additive only: a new table plus its indexes. Nothing existing is altered, so
-- the currently deployed code keeps running unchanged against this schema.
-- Rollback: DROP TABLE "email_drafts";

CREATE TABLE "email_drafts" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "person_id" INTEGER,
    "campaign" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "to_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "thread_key" TEXT,
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_drafts_pkey" PRIMARY KEY ("id")
);

-- A re-run of the drafting skill must UPDATE the pending draft for a
-- company+campaign+step, never queue a second copy of the same email.
CREATE UNIQUE INDEX "email_drafts_tenant_id_company_id_campaign_step_key"
    ON "email_drafts"("tenant_id", "company_id", "campaign", "step");

-- The /outreach list filters on campaign + status.
CREATE INDEX "email_drafts_tenant_id_campaign_status_idx"
    ON "email_drafts"("tenant_id", "campaign", "status");

-- Reply intake looks a thread up by its key (addendum item 3).
CREATE INDEX "email_drafts_tenant_id_thread_key_idx"
    ON "email_drafts"("tenant_id", "thread_key");

ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
