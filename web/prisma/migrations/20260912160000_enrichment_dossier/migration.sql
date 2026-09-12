-- Enrichment dossier + closeness score (addendum item 2).
-- enrichment            = the research skill's dossier JSON (shape: lib/enrichment/dossier.ts)
-- closeness_score       = 0-100, computed inside the CRM from invoices + interactions,
--                         never written from outside; NULL = never computed yet
-- enrichment_updated_at = when the dossier last changed (stamped server-side)
ALTER TABLE "companies"
  ADD COLUMN "enrichment" JSONB,
  ADD COLUMN "closeness_score" INTEGER,
  ADD COLUMN "enrichment_updated_at" TIMESTAMP(3);

ALTER TABLE "persons"
  ADD COLUMN "enrichment" JSONB,
  ADD COLUMN "closeness_score" INTEGER,
  ADD COLUMN "enrichment_updated_at" TIMESTAMP(3);
