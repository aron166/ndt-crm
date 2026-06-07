-- Referential integrity for the lead→deal hand-off. ON DELETE SET NULL: if a
-- deal is deleted, its origin lead's convertedDealId clears and the lead returns
-- to the active board (re-convertible), rather than dangling.
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_converted_deal_id_fkey"
  FOREIGN KEY ("converted_deal_id")
  REFERENCES "deals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
