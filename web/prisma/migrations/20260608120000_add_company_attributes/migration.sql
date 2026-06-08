-- Feature E1: effective-dated company metadata (industry / TEÁOR / warmth /
-- account_type / status). HISTORY source of truth — values are never
-- overwritten; the old row is end-dated (valid_to) and a new row inserted, the
-- same philosophy as the time-bounded Contact. The scalar columns already on
-- companies stay as the denormalized PRIMARY-current value for fast filtering.
--
-- A company may hold several CURRENT values of one attr_type (valid_to IS NULL)
-- — a main TEÁOR + secondary ones — with exactly one is_primary = true.

CREATE TABLE "company_attributes" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "attr_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "source" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_attributes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_attributes_tenant_id_attr_type_value_valid_to_idx"
    ON "company_attributes"("tenant_id", "attr_type", "value", "valid_to");
CREATE INDEX "company_attributes_company_id_attr_type_valid_to_idx"
    ON "company_attributes"("company_id", "attr_type", "valid_to");

ALTER TABLE "company_attributes" ADD CONSTRAINT "company_attributes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_attributes" ADD CONSTRAINT "company_attributes_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill: today's column values become the first CURRENT historical row ──
-- One is_primary current row per company per attr_type, only where the source
-- column is present. source = 'backfill'. Nothing invented; current state is
-- simply recorded as the first historical record.

INSERT INTO "company_attributes" ("tenant_id", "company_id", "attr_type", "value", "label", "source", "is_primary")
SELECT "tenant_id", "id", 'industry', "industry_code", NULLIF("industry_en", ''), 'backfill', true
FROM "companies"
WHERE "deleted_at" IS NULL AND "industry_code" IS NOT NULL AND "industry_code" <> '';

INSERT INTO "company_attributes" ("tenant_id", "company_id", "attr_type", "value", "label", "source", "is_primary")
SELECT "tenant_id", "id", 'teaor', "teaor_code", NULLIF("teaor_description", ''), 'backfill', true
FROM "companies"
WHERE "deleted_at" IS NULL AND "teaor_code" IS NOT NULL AND "teaor_code" <> '';

INSERT INTO "company_attributes" ("tenant_id", "company_id", "attr_type", "value", "label", "source", "is_primary")
SELECT "tenant_id", "id", 'warmth', "warmth", NULL, 'backfill', true
FROM "companies"
WHERE "deleted_at" IS NULL AND "warmth" IS NOT NULL AND "warmth" <> '';

INSERT INTO "company_attributes" ("tenant_id", "company_id", "attr_type", "value", "label", "source", "is_primary")
SELECT "tenant_id", "id", 'account_type', "account_type", NULL, 'backfill', true
FROM "companies"
WHERE "deleted_at" IS NULL AND "account_type" IS NOT NULL AND "account_type" <> '';

INSERT INTO "company_attributes" ("tenant_id", "company_id", "attr_type", "value", "label", "source", "is_primary")
SELECT "tenant_id", "id", 'status', "status", NULL, 'backfill', true
FROM "companies"
WHERE "deleted_at" IS NULL AND "status" IS NOT NULL AND "status" <> '';
