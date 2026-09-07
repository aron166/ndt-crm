-- Per-stage self-documentation (Péter, BRIEFING addendum 2026-09-07 P0 #2):
-- "Placeholder box on every stage; real content only where it is load-bearing
-- (setter call → where the script lives). Enables the 2-minute onboarding."
--
-- Additive + nullable, so the running deployment keeps working before the code
-- that reads it ships. Rollback: ALTER TABLE lead_statuses DROP COLUMN description;
ALTER TABLE "lead_statuses" ADD COLUMN "description" TEXT;

-- Seed the placeholder on every existing stage of every tenant, so the setup page
-- shows the prompt instead of an empty box. Áron/Péter replace these Monday.
UPDATE "lead_statuses"
SET "description" = 'TODO: mit csinálunk ebben a fázisban, hol a script'
WHERE "description" IS NULL;
