-- Marketing module: campaigns, content_items, content_assets. The CRM becomes
-- the approval queue / control tower for AI-generated marketing content.
-- Additive, tenant-scoped, audit-logged like everything else.

CREATE TABLE "campaigns" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "project" TEXT,
    "description" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaigns_tenant_id_slug_key" ON "campaigns"("tenant_id", "slug");
CREATE INDEX "campaigns_tenant_id_idx" ON "campaigns"("tenant_id");

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "content_items" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "campaign_id" INTEGER,
    "channel" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_for" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "external_url" TEXT,
    "source" TEXT NOT NULL,
    "source_meta" JSONB,
    "metrics" JSONB,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_items_tenant_id_status_idx" ON "content_items"("tenant_id", "status");
CREATE INDEX "content_items_tenant_id_campaign_id_idx" ON "content_items"("tenant_id", "campaign_id");

ALTER TABLE "content_items" ADD CONSTRAINT "content_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "content_assets" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "content_item_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_assets_tenant_id_idx" ON "content_assets"("tenant_id");
CREATE INDEX "content_assets_content_item_id_idx" ON "content_assets"("content_item_id");

ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_content_item_id_fkey"
    FOREIGN KEY ("content_item_id") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
