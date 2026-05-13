CREATE TABLE "saved_views" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_views_tenant_id_entity_type_idx" ON "saved_views"("tenant_id", "entity_type");

ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
