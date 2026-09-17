-- NATE-STORAGE-1 (Nate, 2026-09-17): server-side WebP thumbnails for image
-- uploads. `thumb_path` mirrors `storage_path` — sibling object in the same
-- private bucket at `<storage_path>.thumb.webp`. Nullable: set only for
-- images under the 25 MB cap that converted successfully; a missing
-- thumbnail never blocks the asset itself.
--
-- Rollback:
--   ALTER TABLE "content_assets" DROP COLUMN "thumb_path";

-- AlterTable
ALTER TABLE "content_assets" ADD COLUMN     "thumb_path" TEXT;
