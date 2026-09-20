-- The customer's OWN WORD for the technology, as they said it on the call
-- (BACKLOG 2026-09-12 item 6, B5). Free text, never a controlled key: the whole
-- point is to capture the vocabulary the market actually uses, so it feeds copy
-- and positioning later. Additive and nullable: every existing row stays valid
-- and no write path is required to set it.
ALTER TABLE "interactions" ADD COLUMN "technology_word" TEXT;

-- The counts view groups by this column within a tenant.
CREATE INDEX "interactions_tenant_id_technology_word_idx"
  ON "interactions" ("tenant_id", "technology_word");
