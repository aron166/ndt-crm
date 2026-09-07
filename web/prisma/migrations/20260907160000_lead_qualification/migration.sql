-- Setter tab (Péter, BRIEFING addendum 2026-09-07 P0 #3): free-text qualification
-- answers per lead, keyed by a question slug; the question LIST is tenant config.
--
-- Both columns are additive + nullable, so the running deployment keeps working
-- before the code that reads them ships.
-- Rollback: ALTER TABLE leads DROP COLUMN qualification;
--           ALTER TABLE tenants DROP COLUMN settings;

-- { "<question slug>": "<free text answer>" } — shape enforced in app code
-- (lib/leads/qualification.ts), not by the DB, because the question set is
-- tenant-editable and must not need a migration to change.
ALTER TABLE "leads" ADD COLUMN "qualification" JSONB;

-- Generic per-tenant settings bag. First key: `qualificationQuestions`
-- (an ordered array of { slug, label }). Kept as one nullable JSONB column
-- rather than a settings table — one row per tenant, read on nearly every
-- lead render, and nothing here is ever queried BY value.
ALTER TABLE "tenants" ADD COLUMN "settings" JSONB;
