-- Time-based automation support (deal_idle_in_stage).

-- 1. Track when a deal entered its current stage (basis for idle calculations).
ALTER TABLE "deals" ADD COLUMN "stage_entered_at" TIMESTAMP(3);

-- Backfill existing deals: updated_at is the best available proxy for the last
-- stage move (stage changes go through moveDeal, which stamps updated_at).
UPDATE "deals" SET "stage_entered_at" = "updated_at" WHERE "stage_entered_at" IS NULL;

-- 2. Dedupe ledger so a deal_idle_in_stage rule fires at most once per stage entry.
CREATE TABLE "automation_firings" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "deal_id" INTEGER NOT NULL,
    "stage_entered_at" TIMESTAMP(3) NOT NULL,
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_firings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_firings_rule_id_deal_id_stage_entered_at_key"
    ON "automation_firings"("rule_id", "deal_id", "stage_entered_at");

CREATE INDEX "automation_firings_tenant_id_idx" ON "automation_firings"("tenant_id");

ALTER TABLE "automation_firings" ADD CONSTRAINT "automation_firings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_firings" ADD CONSTRAINT "automation_firings_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_firings" ADD CONSTRAINT "automation_firings_deal_id_fkey"
    FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
