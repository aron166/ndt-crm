-- Auto-outcome from a call transcript (trust ladder, backlog item 3).
--
-- A parse posted by the call-outcome SKILL (Claude subscription, not an API call
-- from the CRM) records its own confidence. Above the threshold the outcome is
-- applied through the one shared write path and stamped here as auto-derived;
-- below it, nothing is applied and a "confirm outcome" task carries the
-- suggestion. The transcript is kept on the interaction either way so a human
-- can check what the parse read.
--
-- `supersedes_interaction_id` points at the interaction this one replaces: a
-- human correction of an auto-applied outcome, or a parse answering a queued
-- transcript. Interactions are append-only (decisions.md #2), so nothing is
-- ever stamped onto the older row — a row is "still waiting for a parse"
-- exactly while nothing supersedes it, and the correction link is what makes
-- the agreement rate between parsed and corrected outcomes measurable.
--
-- `call_id` is the caller's correlation id; the unique index makes a repeated
-- POST idempotent in the DATABASE rather than in app code (Postgres treats
-- NULLs as distinct, so rows without a call id are unaffected).
--
-- Additive only. Rollback:
--   DROP INDEX "interactions_tenant_id_call_id_key";
--   DROP INDEX "interactions_supersedes_interaction_id_idx";
--   ALTER TABLE "interactions"
--     DROP COLUMN "transcript", DROP COLUMN "auto_confidence",
--     DROP COLUMN "supersedes_interaction_id", DROP COLUMN "call_id";

-- AlterTable
ALTER TABLE "interactions" ADD COLUMN     "auto_confidence" DOUBLE PRECISION,
ADD COLUMN     "call_id" TEXT,
ADD COLUMN     "supersedes_interaction_id" INTEGER,
ADD COLUMN     "transcript" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "interactions_tenant_id_call_id_key" ON "interactions"("tenant_id", "call_id");

-- CreateIndex
CREATE INDEX "interactions_supersedes_interaction_id_idx" ON "interactions"("supersedes_interaction_id");

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_supersedes_interaction_id_fkey" FOREIGN KEY ("supersedes_interaction_id") REFERENCES "interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
