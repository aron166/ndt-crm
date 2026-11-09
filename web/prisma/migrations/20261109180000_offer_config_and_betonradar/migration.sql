-- Data only (no schema change), tenant 1:
-- 1. Offer config: the issuer's legal facts confirmed by Áron (workspace docs/birdsview/
--    gtm-system-2026-11-08/COMPANY.md, 2026-11-09) and the demo terms. Code holds no
--    legal defaults; only this config does. Skipped when the tenant already has `offers`.
-- 2. Brand rename BetonScan -> BetonRadar in UNSENT email drafts (status draft only;
--    sent mail is history and is never rewritten).
-- Rollback: UPDATE "tenants" SET "settings" = "settings" - 'offers' WHERE "id" = 1;
--           UPDATE "email_drafts" SET "subject" = replace("subject", 'BetonRadar', 'BetonScan'),
--             "body" = replace("body", 'BetonRadar', 'BetonScan') WHERE "tenant_id" = 1 AND "status" = 'draft';
UPDATE "tenants"
SET "settings" = COALESCE("settings", '{}'::jsonb) || jsonb_build_object('offers', jsonb_build_object(
    'issuer', jsonb_build_object(
        'legalName', 'Uphill Trade Kft.',
        'brand', 'BetonRadar',
        'website', 'betonradar.hu',
        'address', '2030 Érd, Bajuszfű utca 29.',
        'taxNumber', '25741814-2-13',
        'companyRegNo', '13-09-233618'
    ),
    'vatRate', 27,
    'validityDays', 30,
    'demo', jsonb_build_object(
        'netHuf', 100000,
        'areaM2', 5,
        'hours', 1,
        'introPeriodText', 'a következő két hónapban',
        'creditRuleText', 'A bemutató mérés díját (100 000 Ft + ÁFA) jóváírjuk, ha a bemutatót követő 2 héten belül legalább 100 m² mérést (ennek megfelelő, legalább 300 000 Ft + ÁFA értékű szolgáltatást), gépbérlést vagy gépvásárlást rendel.'
    )
))
WHERE "id" = 1 AND NOT (COALESCE("settings", '{}'::jsonb) ? 'offers');

UPDATE "email_drafts"
SET "subject" = replace("subject", 'BetonScan', 'BetonRadar'),
    "body" = replace("body", 'BetonScan', 'BetonRadar'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "tenant_id" = 1 AND "status" = 'draft'
  AND ("subject" LIKE '%BetonScan%' OR "body" LIKE '%BetonScan%');
