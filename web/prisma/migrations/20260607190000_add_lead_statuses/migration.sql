-- Customizable lead-pipeline columns (counterpart to pipeline_stages for deals).
CREATE TABLE "lead_statuses" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_initial" BOOLEAN NOT NULL DEFAULT false,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_statuses_tenant_id_key_key" ON "lead_statuses"("tenant_id", "key");

ALTER TABLE "lead_statuses" ADD CONSTRAINT "lead_statuses_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the existing default statuses for the first tenant (Controllabor). Keys
-- match what Lead.status / the intake API already write; labels are Hungarian.
INSERT INTO "lead_statuses" ("tenant_id", "key", "label", "color", "position", "is_initial", "is_terminal")
VALUES
    (1, 'new',           'Új',                '#6366f1', 0, true,  false),
    (1, 'contacted',     'Megkeresve',        '#3b82f6', 1, false, false),
    (1, 'replied',       'Válaszolt',         '#8b5cf6', 2, false, false),
    (1, 'call_booked',   'Hívás egyeztetve',  '#f59e0b', 3, false, false),
    (1, 'qualified',     'Minősített',        '#22c55e', 4, false, false),
    (1, 'proposal_sent', 'Ajánlat kiment',    '#06b6d4', 5, false, false),
    (1, 'unqualified',   'Nem minősül',       '#ef4444', 6, false, true),
    (1, 'nurture',       'Gondozás',          '#64748b', 7, false, true)
ON CONFLICT ("tenant_id", "key") DO NOTHING;
