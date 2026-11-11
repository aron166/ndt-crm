-- Prospect quick view: what the launch-list row said about a member, kept on the member from the load on.
-- segment = the builder's raw segment (mapped to the mailed segment A-G in lib/campaigns/email-preview),
-- source = the list sources ("crm+peterdrive"), contact_source = where the contact route came from
-- (the page the address was found on). Three nullable columns, no default, no data change.
-- Rollback (loses only these three values):
--   ALTER TABLE "campaign_members" DROP COLUMN "segment", DROP COLUMN "source", DROP COLUMN "contact_source";
ALTER TABLE "campaign_members"
    ADD COLUMN "segment" TEXT,
    ADD COLUMN "source" TEXT,
    ADD COLUMN "contact_source" TEXT;
