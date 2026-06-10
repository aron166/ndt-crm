-- Task cost amounts: cost codes carry measurable billable values (qty × rate → HUF),
-- not just a label. Foundation for automatic job invoicing (decisions.md #15).
ALTER TABLE "tasks" ADD COLUMN "cost_quantity" DECIMAL(65,30);
ALTER TABLE "tasks" ADD COLUMN "cost_unit" TEXT;
ALTER TABLE "tasks" ADD COLUMN "cost_unit_rate" DECIMAL(65,30);
ALTER TABLE "tasks" ADD COLUMN "cost_amount" DECIMAL(65,30);
