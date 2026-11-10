-- W9 nurture (spec: workspace docs/birdsview/gtm-system-2026-11-08/W9-funnel-spec.md,
-- CONTENT-PLAN.md sections 2 and 4). Sequences are DATA: segment -> ordered steps
-- (delay from enrolment, template key, audience). NOTHING SENDS unless the template
-- is approved by Áron AND tenants.settings.nurture_enabled is true (default off).
-- Additive only.
-- Rollback: DROP TABLE "nurture_enrollments", "nurture_sequence_steps", "nurture_sequences", "nurture_templates";

CREATE TABLE "nurture_templates" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview" TEXT,
    "body_md" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposal',
    "approved_by_aron" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "requires_asset" TEXT,
    "source_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nurture_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nurture_templates_status_check" CHECK ("status" IN ('proposal', 'approved', 'retired'))
);
CREATE UNIQUE INDEX "nurture_templates_tenant_id_key_key" ON "nurture_templates"("tenant_id", "key");

CREATE TABLE "nurture_sequences" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "segment" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nurture_sequences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nurture_sequences_segment_check" CHECK ("segment" IN ('service', 'device', 'info', 'lost'))
);
CREATE UNIQUE INDEX "nurture_sequences_tenant_id_segment_key" ON "nurture_sequences"("tenant_id", "segment");

-- audience: 'all' = request-related (no opt-in needed), 'opt_in' = newsletter content,
-- 'non_opt_in' = only for leads WITHOUT the opt-in (the one subscribe invite).
CREATE TABLE "nurture_sequence_steps" (
    "id" SERIAL NOT NULL,
    "sequence_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "delay_days" INTEGER NOT NULL,
    "template_key" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    CONSTRAINT "nurture_sequence_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nurture_sequence_steps_audience_check" CHECK ("audience" IN ('all', 'opt_in', 'non_opt_in')),
    CONSTRAINT "nurture_sequence_steps_delay_check" CHECK ("delay_days" >= 0)
);
CREATE UNIQUE INDEX "nurture_sequence_steps_sequence_id_position_key" ON "nurture_sequence_steps"("sequence_id", "position");

CREATE TABLE "nurture_enrollments" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "sequence_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "next_position" INTEGER NOT NULL DEFAULT 1,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "pause_reason" TEXT,
    "stopped_reason" TEXT,
    "last_sent_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nurture_enrollments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nurture_enrollments_status_check" CHECK ("status" IN ('active', 'paused', 'stopped', 'completed'))
);
CREATE UNIQUE INDEX "nurture_enrollments_lead_id_sequence_id_key" ON "nurture_enrollments"("lead_id", "sequence_id");
CREATE INDEX "nurture_enrollments_tenant_id_status_idx" ON "nurture_enrollments"("tenant_id", "status");

ALTER TABLE "nurture_templates" ADD CONSTRAINT "nurture_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nurture_sequences" ADD CONSTRAINT "nurture_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nurture_sequence_steps" ADD CONSTRAINT "nurture_sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "nurture_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nurture_enrollments" ADD CONSTRAINT "nurture_enrollments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "nurture_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed tenant 1 from CONTENT-PLAN.md section 2 (topic numbers -> template keys topic-NN;
-- "service-summary" = the L4 day-0 summary + video, "subscribe-invite" = the one invite).
INSERT INTO "nurture_sequences" ("tenant_id", "segment", "name") VALUES
    (1, 'service', 'Szolgáltatás (konkrét munka)'),
    (1, 'device', 'Eszköz (bérlés / vásárlás)'),
    (1, 'info', 'Tájékozódik'),
    (1, 'lost', 'Elveszett / most nem')
ON CONFLICT ("tenant_id", "segment") DO NOTHING;

INSERT INTO "nurture_sequence_steps" ("sequence_id", "position", "delay_days", "template_key", "audience")
SELECT s.id, v.position, v.delay_days, v.template_key, v.audience
FROM "nurture_sequences" s
JOIN (VALUES
    ('service', 1, 0,  'service-summary', 'all'),
    ('service', 2, 7,  'topic-11', 'all'),
    ('service', 3, 14, 'topic-09', 'all'),
    ('service', 4, 21, 'topic-12', 'all'),
    ('service', 5, 28, 'topic-19', 'all'),
    ('service', 6, 35, 'topic-18', 'all'),
    ('service', 7, 49, 'topic-16', 'all'),
    ('device', 1, 2,  'topic-14', 'all'),
    ('device', 2, 6,  'topic-13', 'all'),
    ('device', 3, 14, 'topic-05', 'all'),
    ('device', 4, 21, 'topic-15', 'all'),
    ('device', 5, 35, 'topic-16', 'all'),
    ('info', 1, 3,  'subscribe-invite', 'non_opt_in'),
    ('info', 2, 7,  'topic-01', 'opt_in'),
    ('info', 3, 14, 'topic-02', 'opt_in'),
    ('info', 4, 21, 'topic-17', 'opt_in'),
    ('info', 5, 28, 'topic-03', 'opt_in'),
    ('info', 6, 35, 'topic-08', 'opt_in'),
    ('info', 7, 42, 'topic-04', 'opt_in'),
    ('info', 8, 49, 'topic-10', 'opt_in'),
    ('info', 9, 56, 'topic-20', 'opt_in'),
    ('info', 10, 63, 'topic-12', 'opt_in'),
    ('info', 11, 70, 'topic-16', 'opt_in'),
    ('lost', 1, 3,  'subscribe-invite', 'non_opt_in'),
    ('lost', 2, 7,  'topic-17', 'opt_in'),
    ('lost', 3, 14, 'topic-08', 'opt_in'),
    ('lost', 4, 21, 'topic-01', 'opt_in'),
    ('lost', 5, 28, 'topic-10', 'opt_in'),
    ('lost', 6, 35, 'topic-16', 'opt_in'),
    ('lost', 7, 42, 'topic-02', 'opt_in')
) AS v(segment, position, delay_days, template_key, audience) ON v.segment = s.segment
WHERE s.tenant_id = 1
ON CONFLICT ("sequence_id", "position") DO NOTHING;
