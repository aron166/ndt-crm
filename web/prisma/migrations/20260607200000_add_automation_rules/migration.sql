-- Configurable task-automation rules ("when <trigger> [and <conditions>] → create task").
-- Generalises the hard-coded new-lead follow-up task into user-editable rules.
CREATE TABLE "automation_rules" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "trigger_type" TEXT NOT NULL,
    "trigger_config" JSONB,
    "conditions" JSONB,
    "action_type" TEXT NOT NULL,
    "action_config" JSONB NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_rules_tenant_id_trigger_type_is_active_idx"
    ON "automation_rules"("tenant_id", "trigger_type", "is_active");

ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the default "new lead → follow-up call task" rule for every existing
-- tenant. This replaces the hard-coded auto-task previously created inside
-- ingestLead, so the live behaviour is preserved after the code moves to the
-- rule engine. {company}/{sourceApp}/{message} are rendered from event context.
INSERT INTO "automation_rules"
    ("tenant_id", "name", "is_active", "trigger_type", "trigger_config", "conditions", "action_type", "action_config", "updated_at")
SELECT
    "id",
    'Új lead → megkeresési feladat',
    true,
    'lead_created',
    NULL,
    NULL,
    'create_task',
    '{"titleTemplate":"Lead megkeresése: {company}","type":"call","category":"revenue_generating","dueInDays":1,"descriptionTemplate":"Új lead a(z) {sourceApp} csatornán. {message}"}'::jsonb,
    CURRENT_TIMESTAMP
FROM "tenants";
