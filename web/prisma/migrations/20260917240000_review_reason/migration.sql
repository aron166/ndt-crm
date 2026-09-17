-- Send-back verdicts carry a structured reason tag (Áron, 2026-09-17): it is the
-- queryable training data for predicting a verdict, alongside the free text.
-- Rollback: ALTER TABLE "content_reviews" DROP COLUMN "reason";

-- AlterTable
ALTER TABLE "content_reviews" ADD COLUMN     "reason" TEXT;

