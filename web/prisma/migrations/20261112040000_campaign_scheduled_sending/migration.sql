-- Scheduled sending (night 2026-11-12, plan item 5): the per-campaign switch that lets the cron sender
-- (/api/cron/campaign-send) send this campaign's already-approved drafts. Default false: no campaign sends by itself
-- until Áron turns it on. Not part of the approval hash (existing approvals stay valid). One column, no data change.
-- Rollback:
--   ALTER TABLE "campaigns" DROP COLUMN "scheduled_sending";
ALTER TABLE "campaigns" ADD COLUMN "scheduled_sending" BOOLEAN NOT NULL DEFAULT false;
