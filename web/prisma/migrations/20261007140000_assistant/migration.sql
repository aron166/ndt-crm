-- In-app assistant (ADR/019): call log + content item notes. New tables only;
-- nothing reads them until this PR's code ships.
-- Rollback: DROP TABLE "content_notes"; DROP TABLE "assistant_calls";
CREATE TABLE "assistant_calls" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "page" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "item_id" INTEGER,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_calls_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assistant_calls_purpose" CHECK ("purpose" IN ('explain', 'ticket'))
);

CREATE INDEX "assistant_calls_tenant_id_created_at_idx" ON "assistant_calls"("tenant_id", "created_at");

ALTER TABLE "assistant_calls" ADD CONSTRAINT "assistant_calls_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assistant_calls" ADD CONSTRAINT "assistant_calls_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "content_notes" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_notes_body_len" CHECK (char_length("body") BETWEEN 1 AND 4000)
);

CREATE INDEX "content_notes_tenant_id_item_id_idx" ON "content_notes"("tenant_id", "item_id");

ALTER TABLE "content_notes" ADD CONSTRAINT "content_notes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_notes" ADD CONSTRAINT "content_notes_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_notes" ADD CONSTRAINT "content_notes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
