-- Péter's canonical pipeline (BVQ5, raw31): offer acceptance is NOT an order;
-- the calendar booking IS the order (megrendelés). Make that an explicit,
-- first-class pipeline semantic — a dedicated flag, mirroring is_initial /
-- is_terminal — so the kanban, reporting and automations can all key off "the
-- order happened" rather than a brittle label/key match.
ALTER TABLE "lead_statuses"
    ADD COLUMN "is_commitment" BOOLEAN NOT NULL DEFAULT false;

-- Make room after 'proposal_sent' (position 5) for the two new statuses by
-- shifting the terminal columns down. Scoped to the seeded keys for tenant 1 so
-- a tenant who already customised their board is untouched.
UPDATE "lead_statuses" SET "position" = 8 WHERE "tenant_id" = 1 AND "key" = 'unqualified';
UPDATE "lead_statuses" SET "position" = 9 WHERE "tenant_id" = 1 AND "key" = 'nurture';

-- accepted = ajánlat elfogadva (accepted, NOT yet an order)
-- booked    = időpont lefoglalva (= MEGRENDELÉS — the commitment point)
INSERT INTO "lead_statuses" ("tenant_id", "key", "label", "color", "position", "is_initial", "is_terminal", "is_commitment")
VALUES
    (1, 'accepted', 'Ajánlat elfogadva',        '#14b8a6', 6, false, false, false),
    (1, 'booked',   'Lefoglalva (megrendelés)', '#16a34a', 7, false, false, true)
ON CONFLICT ("tenant_id", "key") DO NOTHING;
