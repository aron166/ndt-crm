-- Assistant v3: per-user conversations, persisted so a chat survives page changes and reloads.
-- Messages live in one JSONB array (capped in app code at 40), soft delete via deleted_at.
-- Every model call and conversation event is linked through assistant_calls.conversation_id.
-- Rollback:
--   DELETE FROM "assistant_calls" WHERE "purpose" IN ('chat', 'read', 'conversation');
--   ALTER TABLE "assistant_calls" DROP CONSTRAINT "assistant_calls_purpose";
--   ALTER TABLE "assistant_calls" ADD CONSTRAINT "assistant_calls_purpose"
--       CHECK ("purpose" IN ('explain', 'ticket', 'propose', 'execute', 'callnote'));
--   ALTER TABLE "assistant_calls" DROP COLUMN "conversation_id";
--   DROP TABLE "assistant_conversations";
CREATE TABLE "assistant_conversations" (
    "id" SERIAL PRIMARY KEY,
    "tenant_id" INTEGER NOT NULL REFERENCES "tenants"("id"),
    "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "item_id" INTEGER,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3)
);
CREATE INDEX "assistant_conversations_owner_idx" ON "assistant_conversations" ("tenant_id", "user_id", "updated_at" DESC);
ALTER TABLE "assistant_calls" ADD COLUMN "conversation_id" INTEGER;
ALTER TABLE "assistant_calls" DROP CONSTRAINT "assistant_calls_purpose";
ALTER TABLE "assistant_calls" ADD CONSTRAINT "assistant_calls_purpose"
    CHECK ("purpose" IN ('explain', 'ticket', 'propose', 'execute', 'callnote', 'chat', 'read', 'conversation'));
