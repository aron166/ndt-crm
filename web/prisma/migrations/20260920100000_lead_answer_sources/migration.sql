-- Per-answer provenance for a lead: what the FORM said and what the SETTER
-- said, per question slug, each with its time. `leads.qualification` stays the
-- effective answer map (setter wins) so computeTier() and every statistic read
-- exactly what they read before.
--
-- Additive and nullable. Existing rows keep NULL: their answers have no
-- recorded origin and the lead page shows them as such.
--
-- Rollback: ALTER TABLE "leads" DROP COLUMN "answer_sources";
ALTER TABLE "leads" ADD COLUMN "answer_sources" JSONB;
