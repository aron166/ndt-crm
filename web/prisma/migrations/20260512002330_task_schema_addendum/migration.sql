-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "cost_code" TEXT,
ADD COLUMN     "executor_type" TEXT NOT NULL DEFAULT 'human',
ADD COLUMN     "set_membership" TEXT[],
ADD COLUMN     "skill_required_id" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'created';
