-- Data only: fill the W2 columns leads.intent / leads.buyer_type from the form
-- answers already stored in leads.qualification (Kai 2026-11-09; today: leads 21, 22).
-- Same mapping as w2FieldsFromAnswers (web/src/lib/leads/lifecycle.ts). Guarded:
-- only NULL columns are filled, only known values, tenant 1. Nothing else changes.
-- Rollback: not needed for data that was NULL; to undo, set the two columns back to NULL
--   for the ids listed by: SELECT id FROM leads WHERE tenant_id = 1 AND (intent IS NOT NULL OR buyer_type IS NOT NULL);
UPDATE "leads" SET "intent" = CASE lower(trim("qualification"->>'intent'))
        WHEN 'service_concrete' THEN 'service_concrete'
        WHEN 'service_vague' THEN 'service_vague'
        WHEN 'service' THEN 'service_vague'
        WHEN 'rental' THEN 'rental'
        WHEN 'purchase' THEN 'purchase'
        WHEN 'device' THEN 'unknown'
        WHEN 'info' THEN 'unknown'
        WHEN 'unknown' THEN 'unknown'
    END
WHERE "tenant_id" = 1 AND "intent" IS NULL
  AND lower(trim("qualification"->>'intent')) IN ('service_concrete', 'service_vague', 'service', 'rental', 'purchase', 'device', 'info', 'unknown');

UPDATE "leads" SET "buyer_type" = lower(trim(COALESCE("qualification"->>'buyer_type', "qualification"->>'situation')))
WHERE "tenant_id" = 1 AND "buyer_type" IS NULL
  AND lower(trim(COALESCE("qualification"->>'buyer_type', "qualification"->>'situation'))) IN ('company', 'private');
