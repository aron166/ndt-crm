-- Campaign tracking (Kai/Áron P0, 2026-09-17). Cold-email round one goes out BY
-- HAND from two personal Gmail inboxes (Resend cannot send as them), plus a
-- non-email campaign (Péter's multi-unit accounts: calls + meetings). Everything
-- here is additive and nullable; counts are computed from rows, never cached.
--
-- Rollback:
--   ALTER TABLE "email_drafts" DROP CONSTRAINT "email_drafts_sender_user_id_fkey";
--   DROP INDEX "email_drafts_tenant_id_due_at_idx";
--   DROP INDEX "interactions_tenant_id_campaign_idx";
--   ALTER TABLE "email_drafts" DROP COLUMN "sender_user_id", DROP COLUMN "wave",
--     DROP COLUMN "due_at", DROP COLUMN "sent_via", DROP COLUMN "external_thread_id",
--     DROP COLUMN "replied_at", DROP COLUMN "reply_type";
--   ALTER TABLE "interactions" DROP COLUMN "campaign";

-- AlterTable
ALTER TABLE "interactions" ADD COLUMN "campaign" TEXT;

-- AlterTable
ALTER TABLE "email_drafts"
  ADD COLUMN "sender_user_id" INTEGER,
  ADD COLUMN "wave" INTEGER,
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "sent_via" TEXT,
  ADD COLUMN "external_thread_id" TEXT,
  ADD COLUMN "replied_at" TIMESTAMP(3),
  ADD COLUMN "reply_type" TEXT;

-- Rows sent before this migration all went through Resend (the only send path).
UPDATE "email_drafts" SET "sent_via" = 'resend' WHERE "sent_at" IS NOT NULL AND "sent_via" IS NULL;

-- CreateIndex
CREATE INDEX "interactions_tenant_id_campaign_idx" ON "interactions"("tenant_id", "campaign");

-- CreateIndex
CREATE INDEX "email_drafts_tenant_id_due_at_idx" ON "email_drafts"("tenant_id", "due_at");

-- AddForeignKey
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
