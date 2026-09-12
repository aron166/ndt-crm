-- Which call script a call actually used (BACKLOG 2026-09-12 item 1: a manual
-- stage is only ready to hand to an agent once its outcomes are measurable).
-- The variant DEFINITIONS are tenant config (tenants.settings.scriptVariants);
-- only the key is stamped here, so re-wording a script keeps its history and
-- deleting one does not erase the calls made with it.
ALTER TABLE "interactions" ADD COLUMN "script_variant" TEXT;

-- The stats view groups by (tenant, variant) over call interactions. Kept
-- non-partial so it matches @@index in schema.prisma exactly — a partial index
-- here reads as drift and the next `migrate dev` would try to "fix" it.
CREATE INDEX "interactions_tenant_id_script_variant_idx"
  ON "interactions" ("tenant_id", "script_variant");
