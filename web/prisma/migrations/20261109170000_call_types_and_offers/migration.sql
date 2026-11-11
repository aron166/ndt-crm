-- Sales process 2026-11-09 (Péter + Áron, raw60 D12/D18/D20): call types as
-- labels on interactions, and offer templates on quotes (an offer = a quote
-- generated from a lead, its document facts frozen in `meta`). Additive only.
-- Rollback: ALTER TABLE "interactions" DROP COLUMN "call_type";
--           ALTER TABLE "quotes" DROP COLUMN "template", DROP COLUMN "meta";
ALTER TABLE "interactions"
    ADD COLUMN "call_type" TEXT,
    ADD CONSTRAINT "interactions_call_type_check"
        CHECK ("call_type" IN ('qualification', 'support', 'booking', 'offer_followup'));

ALTER TABLE "quotes"
    ADD COLUMN "template" TEXT,
    ADD COLUMN "meta" JSONB,
    ADD CONSTRAINT "quotes_template_check"
        CHECK ("template" IN ('demo', 'big_service', 'rental', 'purchase'));
