-- §6c (Áron, 2026-09-17): ⚠ checklists, archive/restore and the hard-delete gate.
--   content_checks   one ⚠ question per item; an OPEN one blocks going live.
--   prev_status      the status to restore when un-archiving.
--   was_live         true once an item has been live — such an item may only be
--                    archived, never hard-deleted (campaign history stays intact).
-- `question` is capped at 500 chars in the app, so the unique index stays inside
-- the btree key limit.
--
-- Rollback:
--   DROP TABLE "content_checks";
--   ALTER TABLE "content_items" DROP COLUMN "prev_status", DROP COLUMN "was_live";

-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "prev_status" TEXT,
ADD COLUMN     "was_live" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "content_checks" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "for_whom" TEXT NOT NULL DEFAULT 'either',
    "state" TEXT NOT NULL DEFAULT 'open',
    "answer" TEXT,
    "resolved_by_user_id" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_checks_tenant_id_state_idx" ON "content_checks"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "content_checks_item_id_question_key" ON "content_checks"("item_id", "question");

-- AddForeignKey
ALTER TABLE "content_checks" ADD CONSTRAINT "content_checks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_checks" ADD CONSTRAINT "content_checks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_checks" ADD CONSTRAINT "content_checks_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Items that are live (incl. the ones the 2026-09-17 migration mapped) have been live.
UPDATE "content_items" SET "was_live" = true WHERE "live_version_id" IS NOT NULL;
