-- Platform Foundation #4: per-app ingestion credentials + lead ingest fields.

-- New: app_api_keys — scoped, hashed, revocable API keys per source app.
CREATE TABLE "app_api_keys" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "app_slug" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    CONSTRAINT "app_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_api_keys_key_hash_key" ON "app_api_keys"("key_hash");

CREATE INDEX "app_api_keys_tenant_id_idx" ON "app_api_keys"("tenant_id");

ALTER TABLE "app_api_keys" ADD CONSTRAINT "app_api_keys_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend leads: capture submitting app, free-text message, and marketing passthrough.
ALTER TABLE "leads" ADD COLUMN "source_app" TEXT;
ALTER TABLE "leads" ADD COLUMN "message" TEXT;
ALTER TABLE "leads" ADD COLUMN "custom_fields" JSONB;
