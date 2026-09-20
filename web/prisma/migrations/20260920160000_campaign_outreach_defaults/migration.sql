-- Campaign becomes the single campaign identity (2026-09-20).
--
-- `campaigns.slug` already IS the outreach campaign key by convention
-- (scripts/content-fixtures.mjs seeds slug 'cold-email-v0', which is exactly
-- what scripts/import-cold-email-v0.mjs writes into email_drafts.campaign).
-- This migration only lets a campaign row carry the two outreach defaults a
-- human has to pick BEFORE any draft row exists: whose inbox the touches leave
-- from, and which wave they belong to.
--
-- Purely additive and nullable. It does not read, write or constrain
-- email_drafts, leads or interactions, so it cannot disturb a send in flight.
-- The free-string campaign columns on those three tables are UNCHANGED and
-- deliberately still not foreign keys: a sent email's campaign key must never
-- be able to dangle. Promoting them is its own migration, specced in
-- docs/specs/campaign-key-fk-promotion.md.
--
-- Rollback:
--   ALTER TABLE "campaigns" DROP COLUMN "sender_user_id";
--   ALTER TABLE "campaigns" DROP COLUMN "current_wave";

ALTER TABLE "campaigns" ADD COLUMN "sender_user_id" INTEGER;
ALTER TABLE "campaigns" ADD COLUMN "current_wave" INTEGER;

CREATE INDEX "campaigns_sender_user_id_idx" ON "campaigns"("sender_user_id");

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_sender_user_id_fkey"
  FOREIGN KEY ("sender_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
