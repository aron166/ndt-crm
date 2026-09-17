-- The submitting agent's own verdict on a version: confidence 0..1 plus a short
-- note (trust ladder, Áron 2026-09-17). Recorded and displayed only; no logic
-- acts on it yet. Rollback:
--   ALTER TABLE "content_versions" DROP COLUMN "self_score", DROP COLUMN "self_note";

-- AlterTable
ALTER TABLE "content_versions" ADD COLUMN     "self_note" TEXT,
ADD COLUMN     "self_score" DOUBLE PRECISION;
