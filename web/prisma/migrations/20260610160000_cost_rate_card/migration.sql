-- Cost rate card: tenant-level default unit + HUF rate per NDT cost code.
-- Auto-fills the task cost section (decisions.md #15).
CREATE TABLE "cost_rates" (
  "id"         SERIAL NOT NULL,
  "tenant_id"  INTEGER NOT NULL,
  "code"       TEXT NOT NULL,
  "unit"       TEXT,
  "unit_rate"  DECIMAL(65,30),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cost_rates_tenant_id_code_key" ON "cost_rates"("tenant_id", "code");

ALTER TABLE "cost_rates" ADD CONSTRAINT "cost_rates_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
