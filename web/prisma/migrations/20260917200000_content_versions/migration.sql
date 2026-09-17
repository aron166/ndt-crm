-- Content approval pipeline (spec 2026-09-17-content-approval-design.md, plan
-- docs/plans/2026-09-17-content-approval.md). Additive, plus a data step that
-- gives every existing item a version 1.
--
-- Status mapping for existing rows (documented per spec §1):
--   draft, in_review          → unchanged
--   approved|scheduled|published → live   (live_version_id = v1)
--   rejected                  → archived
-- Category from content_type: email → email, video_script → video, else other.
-- Existing assets are attached to the item's v1.
--
-- Rollback (after reverting the app):
--   ALTER TABLE "content_items" DROP CONSTRAINT "content_items_current_version_id_fkey",
--     DROP CONSTRAINT "content_items_live_version_id_fkey";
--   ALTER TABLE "content_assets" DROP CONSTRAINT "content_assets_version_id_fkey";
--   DROP TABLE "content_reviews"; DROP TABLE "content_versions";
--   ALTER TABLE "content_items" DROP COLUMN "category", DROP COLUMN "format", DROP COLUMN "purpose",
--     DROP COLUMN "external_ref", DROP COLUMN "current_version_id", DROP COLUMN "live_version_id",
--     DROP COLUMN "claimed_at", DROP COLUMN "claimed_by", DROP COLUMN "claimed_from",
--     DROP COLUMN "needs_human_asset";
--   ALTER TABLE "content_assets" DROP COLUMN "version_id", DROP COLUMN "storage_path",
--     DROP COLUMN "mime_type", DROP COLUMN "size_bytes";
--   Status values mapped to live/archived are NOT restored (prod had none on 2026-09-17).

-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "claimed_by" TEXT,
ADD COLUMN     "claimed_from" TEXT,
ADD COLUMN     "current_version_id" INTEGER,
ADD COLUMN     "external_ref" TEXT,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "live_version_id" INTEGER,
ADD COLUMN     "needs_human_asset" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purpose" TEXT;

-- AlterTable
ALTER TABLE "content_assets" ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "storage_path" TEXT,
ADD COLUMN     "version_id" INTEGER;

-- CreateTable
CREATE TABLE "content_versions" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "author_type" TEXT NOT NULL,
    "author_user_id" INTEGER,
    "author_app" TEXT,
    "change_note" TEXT,
    "based_on_version_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reviews" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "version_id" INTEGER NOT NULL,
    "reviewer_user_id" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_versions_tenant_id_idx" ON "content_versions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_item_id_number_key" ON "content_versions"("item_id", "number");

-- CreateIndex
CREATE INDEX "content_reviews_tenant_id_reviewer_user_id_idx" ON "content_reviews"("tenant_id", "reviewer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_reviews_version_id_reviewer_user_id_key" ON "content_reviews"("version_id", "reviewer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_current_version_id_key" ON "content_items"("current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_live_version_id_key" ON "content_items"("live_version_id");

-- CreateIndex
CREATE INDEX "content_items_tenant_id_category_idx" ON "content_items"("tenant_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_tenant_id_external_ref_key" ON "content_items"("tenant_id", "external_ref");

-- CreateIndex
CREATE INDEX "content_assets_version_id_idx" ON "content_assets"("version_id");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_live_version_id_fkey" FOREIGN KEY ("live_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_based_on_version_id_fkey" FOREIGN KEY ("based_on_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "content_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Data step ──────────────────────────────────────────────────────────────
INSERT INTO "content_versions" ("tenant_id", "item_id", "number", "body", "author_type", "author_app", "change_note", "created_at")
SELECT "tenant_id", "id", 1, "body", 'import', "source", 'Átvéve a verziókezelés előtti állapotból', "created_at"
FROM "content_items";

UPDATE "content_items" ci SET "current_version_id" = cv."id"
FROM "content_versions" cv WHERE cv."item_id" = ci."id" AND cv."number" = 1;

UPDATE "content_items" SET "live_version_id" = "current_version_id", "status" = 'live'
WHERE "status" IN ('approved', 'scheduled', 'published');

UPDATE "content_items" SET "status" = 'archived' WHERE "status" = 'rejected';

UPDATE "content_items" SET "category" = CASE "content_type"
  WHEN 'email' THEN 'email' WHEN 'video_script' THEN 'video' ELSE 'other' END;

UPDATE "content_assets" ca SET "version_id" = ci."current_version_id"
FROM "content_items" ci WHERE ci."id" = ca."content_item_id";
