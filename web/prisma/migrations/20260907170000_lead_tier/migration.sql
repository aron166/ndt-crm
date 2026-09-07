-- Derived qualification tier (A–E) from the locked qualification model
-- (machines/birdsview/27_qualification_model.md, 2026-09-07).
-- Nullable: a lead with no placing answers has no tier. Recomputed by the app on
-- every qualification write (lib/leads/tier.ts), never entered by hand.
ALTER TABLE "leads" ADD COLUMN "tier" TEXT;
