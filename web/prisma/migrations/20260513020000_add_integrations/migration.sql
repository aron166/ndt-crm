CREATE TABLE "integration_credentials" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "integration_slug" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_credentials_tenant_id_integration_slug_key"
  ON "integration_credentials"("tenant_id", "integration_slug");

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
