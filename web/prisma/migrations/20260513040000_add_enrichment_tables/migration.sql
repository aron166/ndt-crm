-- EnrichmentRun: tracks a batch enrichment job
CREATE TABLE "enrichment_runs" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_ids" INTEGER[] NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggered_by" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enrichment_runs_pkey" PRIMARY KEY ("id")
);

-- EnrichmentProposal: one proposal per entity per run
CREATE TABLE "enrichment_proposals" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "run_id" INTEGER NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "entity_name" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "overall_status" TEXT NOT NULL DEFAULT 'pending',
    "raw_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enrichment_proposals_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "enrichment_runs_tenant_id_idx" ON "enrichment_runs"("tenant_id");
CREATE INDEX "enrichment_runs_status_idx" ON "enrichment_runs"("status");
CREATE INDEX "enrichment_proposals_run_id_idx" ON "enrichment_proposals"("run_id");
CREATE INDEX "enrichment_proposals_entity_idx" ON "enrichment_proposals"("entity_type", "entity_id");

-- Foreign keys
ALTER TABLE "enrichment_runs" ADD CONSTRAINT "enrichment_runs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrichment_proposals" ADD CONSTRAINT "enrichment_proposals_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrichment_proposals" ADD CONSTRAINT "enrichment_proposals_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "enrichment_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
