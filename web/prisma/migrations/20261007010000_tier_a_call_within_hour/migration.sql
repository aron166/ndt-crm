-- Tier A "call within 1 hour" (growth Lane 0.6). Data only, no DDL.
--
-- 1. Seed one lead_created rule per tenant: tier = A -> call task due in 60
--    minutes, assigned to the tenant's first real admin (lowest id, the
--    migration@system row excluded). Editable in /automations afterwards.
--    Idempotent by name, so a re-run does not duplicate it.
INSERT INTO "automation_rules"
    ("tenant_id", "name", "is_active", "trigger_type", "trigger_config", "conditions", "action_type", "action_config", "updated_at")
SELECT
    t."id",
    'A tier lead -> hívás 1 órán belül',
    true,
    'lead_created',
    NULL,
    '[{"field":"tier","op":"eq","value":"A"}]'::jsonb,
    'create_task',
    jsonb_strip_nulls(jsonb_build_object(
        'titleTemplate', 'Hívd 1 órán belül: {company}',
        'type', 'call',
        'category', 'revenue_generating',
        'dueInMinutes', 60,
        'descriptionTemplate', 'A tier lead a(z) {sourceApp} csatornán. {message}',
        'assignedToId', (SELECT u."id" FROM "users" u
                          WHERE u."tenant_id" = t."id" AND u."role" = 'admin'
                            AND u."email" <> 'migration@system'
                          ORDER BY u."id" LIMIT 1)
    )),
    CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
    SELECT 1 FROM "automation_rules" r
    WHERE r."tenant_id" = t."id" AND r."name" = 'A tier lead -> hívás 1 órán belül'
);

-- 2. The default "new lead -> follow-up call due tomorrow" rule would ALSO fire
--    on a tier A lead and put a second call task on the list. Exclude tier A
--    from it, but only where nobody has edited its conditions yet.
UPDATE "automation_rules"
SET "conditions" = '[{"field":"tier","op":"ne","value":"A"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "trigger_type" = 'lead_created'
  AND "action_type" = 'create_task'
  AND "conditions" IS NULL
  AND "action_config"->>'titleTemplate' = 'Lead megkeresése: {company}';

-- Rollback:
--   DELETE FROM "automation_rules" WHERE "name" = 'A tier lead -> hívás 1 órán belül';
--   UPDATE "automation_rules" SET "conditions" = NULL
--    WHERE "conditions" = '[{"field":"tier","op":"ne","value":"A"}]'::jsonb
--      AND "action_config"->>'titleTemplate' = 'Lead megkeresése: {company}';
