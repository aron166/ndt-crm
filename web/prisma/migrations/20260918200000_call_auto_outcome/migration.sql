-- Auto-outcome from a call transcript (trust ladder, backlog item 3).
--
-- A parse posted by the call-outcome SKILL (Claude subscription, not an API call
-- from the CRM) records its own confidence. Above the threshold the outcome is
-- applied through the one shared write path and stamped here as auto-derived;
-- below it, nothing is applied and a "confirm outcome" task carries the
-- suggestion. The transcript is kept on the interaction either way so a human
-- can check what the parse read.
--
-- `corrects_interaction_id` links a human correction back to the auto-applied
-- interaction it replaces — that link is what makes the agreement rate between
-- parsed and corrected outcomes measurable later.
--
-- `call_id` is the caller's correlation id; the unique index makes a repeated
-- POST idempotent in the DATABASE rather than in app code (Postgres treats
-- NULLs as distinct, so rows without a call id are unaffected).
--
-- Additive only. Rollback:
--   DROP INDEX "interactions_tenant_id_call_id_key";
--   ALTER TABLE "interactions"
--     DROP COLUMN "transcript", DROP COLUMN "auto_confidence",
--     DROP COLUMN "parsed_at", DROP COLUMN "corrects_interaction_id",
--     DROP COLUMN "call_id";

-- AlterTable
ALTER TABLE "interactions" ADD COLUMN     "auto_confidence" DOUBLE PRECISION,
ADD COLUMN     "call_id" TEXT,
ADD COLUMN     "corrects_interaction_id" INTEGER,
ADD COLUMN     "parsed_at" TIMESTAMP(3),
ADD COLUMN     "transcript" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "interactions_tenant_id_call_id_key" ON "interactions"("tenant_id", "call_id");

-- CreateIndex
CREATE INDEX "interactions_tenant_id_parsed_at_idx" ON "interactions"("tenant_id", "parsed_at");

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_corrects_interaction_id_fkey" FOREIGN KEY ("corrects_interaction_id") REFERENCES "interactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
