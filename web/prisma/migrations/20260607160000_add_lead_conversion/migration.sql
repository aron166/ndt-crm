-- Lead→deal hand-off. When a lead is converted, these stamp the resulting deal
-- and timestamp; the lead then leaves the active leads board (kept for history).
ALTER TABLE "leads" ADD COLUMN "converted_deal_id" INTEGER;
ALTER TABLE "leads" ADD COLUMN "converted_at" TIMESTAMP(3);

-- Active-board query filters on (tenant_id, converted_deal_id IS NULL).
CREATE INDEX "leads_tenant_id_converted_deal_id_idx" ON "leads"("tenant_id", "converted_deal_id");
