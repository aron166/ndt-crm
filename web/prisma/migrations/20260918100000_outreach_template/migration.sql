-- 6b: link a live email content item to a cold-email campaign step, and record
-- which template version each draft was built from (Kai, 2026-09-18).
-- Additive and nullable. The slot is keyed on the outreach campaign STRING,
-- which is what drafts, leads, interactions and thread keys already use;
-- unifying that string with the Campaign row is a separate migration.
-- Rollback:
--   ALTER TABLE "email_drafts" DROP CONSTRAINT "email_drafts_template_version_id_fkey";
--   ALTER TABLE "email_drafts" DROP COLUMN "template_version_id";
--   DROP INDEX "content_items_tenant_id_outreach_campaign_outreach_step_key";
--   DROP INDEX "content_items_tenant_id_outreach_campaign_outreach_step_idx";
--   ALTER TABLE "content_items" DROP COLUMN "outreach_step", DROP COLUMN "outreach_campaign";

-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "outreach_campaign" TEXT,
ADD COLUMN     "outreach_step" INTEGER;

-- AlterTable
ALTER TABLE "email_drafts" ADD COLUMN     "template_version_id" INTEGER;

-- CreateIndex
CREATE INDEX "content_items_tenant_id_outreach_campaign_outreach_step_idx" ON "content_items"("tenant_id", "outreach_campaign", "outreach_step");

-- A slot holds exactly one item. Partial, so the thousands of items with no
-- slot do not collide with each other on (NULL, NULL).
CREATE UNIQUE INDEX "content_items_tenant_id_outreach_campaign_outreach_step_key" ON "content_items"("tenant_id", "outreach_campaign", "outreach_step") WHERE "outreach_campaign" IS NOT NULL AND "outreach_step" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
