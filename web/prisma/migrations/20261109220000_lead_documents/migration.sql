-- Documents generated for a lead (raw60 D13/D16, Áron 2026-11-09):
--   order       = Megrendelő, created when an offer is accepted ("Ajánlat elfogadva")
--   completion  = teljesítésigazolás, created by the on-site sign-off (signature + timestamp)
-- The PDF is rendered from the frozen `data` (issuer, customer, scope, prices,
-- signature as a PNG data URL), never from live rows. Additive only.
-- Also: the W2 self-transition ordered --work_completed--> ordered (work done and
-- signed, not paid yet; invoicing stays manual), seeded for tenant 1.
-- Rollback: DELETE FROM "lead_status_transitions" WHERE "event" = 'work_completed';
--           DROP TABLE "lead_documents";
CREATE TABLE "lead_documents" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "quote_id" INTEGER,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lead_documents_kind_check" CHECK ("kind" IN ('order', 'completion'))
);
CREATE UNIQUE INDEX "lead_documents_tenant_id_number_key" ON "lead_documents"("tenant_id", "number");
-- One Megrendelő per accepted quote (idempotent acceptance).
CREATE UNIQUE INDEX "lead_documents_quote_id_kind_key" ON "lead_documents"("quote_id", "kind");
CREATE INDEX "lead_documents_tenant_id_lead_id_idx" ON "lead_documents"("tenant_id", "lead_id");
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "lead_status_transitions" ("tenant_id", "from_status", "event", "to_status", "action")
VALUES (1, 'ordered', 'work_completed', 'ordered', 'teljesítésigazolás signed on site, invoice task (manual)')
ON CONFLICT ("tenant_id", "from_status", "event") DO NOTHING;
