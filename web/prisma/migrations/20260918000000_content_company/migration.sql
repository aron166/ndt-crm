-- The company a content item is for, so the rewrite loop can read that
-- company's dossier (companies.enrichment) instead of guessing (Áron 2026-09-17).
-- Additive and nullable; SET NULL on company delete.
-- Rollback:
--   ALTER TABLE "content_items" DROP CONSTRAINT "content_items_company_id_fkey";
--   DROP INDEX "content_items_tenant_id_company_id_idx";
--   ALTER TABLE "content_items" DROP COLUMN "company_id";

-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "company_id" INTEGER;
-- CreateIndex
CREATE INDEX "content_items_tenant_id_company_id_idx" ON "content_items"("tenant_id", "company_id");
-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
