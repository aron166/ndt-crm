-- A slot is a PAIR. Without this, "outreach_campaign set, outreach_step NULL"
-- is storable: it escapes the partial unique index and is invisible to
-- templatesForCampaign, so it would sit there gating nothing (Vanda, #105).
-- The application already refuses half a slot; this makes the database agree.
-- Safe on existing data: no row uses either column yet.
-- Rollback:
--   ALTER TABLE "content_items" DROP CONSTRAINT "content_items_outreach_slot_pair";

ALTER TABLE "content_items"
  ADD CONSTRAINT "content_items_outreach_slot_pair"
  CHECK (("outreach_campaign" IS NULL) = ("outreach_step" IS NULL));
