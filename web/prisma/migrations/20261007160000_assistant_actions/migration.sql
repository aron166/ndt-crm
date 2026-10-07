-- Assistant v2 (ADR/019 15:00 extension): action proposals, executed actions and
-- the call-note endpoint (app key, no CRM user) share the assistant_calls log.
-- Rollback:
--   DELETE FROM "assistant_calls" WHERE "user_id" IS NULL OR "purpose" NOT IN ('explain', 'ticket');
--   ALTER TABLE "assistant_calls" DROP CONSTRAINT "assistant_calls_purpose";
--   ALTER TABLE "assistant_calls" ADD CONSTRAINT "assistant_calls_purpose" CHECK ("purpose" IN ('explain', 'ticket'));
--   ALTER TABLE "assistant_calls" DROP COLUMN "action";
--   ALTER TABLE "assistant_calls" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "assistant_calls" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "assistant_calls" ADD COLUMN "action" TEXT;
ALTER TABLE "assistant_calls" DROP CONSTRAINT "assistant_calls_purpose";
ALTER TABLE "assistant_calls" ADD CONSTRAINT "assistant_calls_purpose"
    CHECK ("purpose" IN ('explain', 'ticket', 'propose', 'execute', 'callnote'));
