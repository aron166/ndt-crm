-- W2: "reached, second call agreed" keeps the lead in contacting (Kai, 2026-11-09).
-- Additive seed for tenant 1, mirrors DEFAULT_TRANSITIONS in web/src/lib/leads/lifecycle.ts.
-- Rollback: DELETE FROM "lead_status_transitions" WHERE "tenant_id" = 1 AND "event" = 'call_logged';
INSERT INTO "lead_status_transitions" ("tenant_id", "from_status", "event", "to_status", "action") VALUES
    (1, 'new', 'call_logged', 'contacting', 'second call task'),
    (1, 'contacting', 'call_logged', 'contacting', 'second call task')
ON CONFLICT ("tenant_id", "from_status", "event") DO NOTHING;
