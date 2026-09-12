-- Fix-forward on 20260912120000_email_drafts. That migration was applied to prod
-- before two intended corrections made it into the file, and an applied
-- migration is frozen — so they land here instead.
--
-- 1. `company_id` was created ON DELETE CASCADE. A sent draft is the record of
--    an email that left the building; hard-deleting a company must not erase it.
--    Companies are soft-deleted in this app anyway, so RESTRICT costs nothing.
-- 2. `updated_at` is NOT NULL with no default. Prisma's @updatedAt always
--    supplies it, but any raw/ETL/psql insert would fail on it.
--
-- Safe on a populated table: email_drafts is empty on prod today, and both
-- statements are metadata-only regardless.
-- Rollback: re-create the FK with ON DELETE CASCADE and DROP the DEFAULT.

ALTER TABLE "email_drafts" DROP CONSTRAINT "email_drafts_company_id_fkey";
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_drafts" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
