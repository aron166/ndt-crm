-- Columns that only ever existed as hand-run SQL (`manual_company_ndt_profile.sql`,
-- `manual_crud_softdelete.sql`), applied straight to prod and never turned into a
-- migration. A clean database therefore never got them and `migrate deploy` died in
-- 20260608120000_add_company_attributes, which backfills from companies.industry_en.
-- Every statement is IF NOT EXISTS, so this is a no-op on prod.


ALTER TABLE companies ADD COLUMN IF NOT EXISTS eu_vat_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS warmth TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS teaor_code TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS teaor_description TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry_en TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS scope_of_activity TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS ndt_methods TEXT[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS product_areas TEXT[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS materials TEXT[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS products TEXT[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_ped_compliant BOOLEAN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS inspection_frequency TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_internal_lab BOOLEAN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS competitor_1 TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS competitor_2 TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS competitor_3 TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS site_zip TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS site_city TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS site_street TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS site_county TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS site_country TEXT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_2019 BIGINT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_2020 BIGINT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_2021 BIGINT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_2022 BIGINT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_2023 BIGINT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_2024 BIGINT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_value BIGINT;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS custom_fields JSONB;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE persons   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
