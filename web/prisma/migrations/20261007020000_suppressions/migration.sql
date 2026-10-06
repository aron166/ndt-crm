-- Suppression (do-not-contact) list. New table only; nothing reads it until
-- this PR's code ships. Rollback: DROP TABLE "suppressions";
CREATE TABLE "suppressions" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "email" TEXT,
    "domain" TEXT,
    "requested_at" DATE NOT NULL,
    "channel" TEXT,
    "source" TEXT,
    "note" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id"),
    -- Exactly one of email / domain, both stored normalised.
    CONSTRAINT "suppressions_one_target" CHECK (("email" IS NULL) <> ("domain" IS NULL)),
    CONSTRAINT "suppressions_email_norm" CHECK ("email" IS NULL OR "email" = lower(btrim("email"))),
    CONSTRAINT "suppressions_domain_norm" CHECK ("domain" IS NULL OR ("domain" = lower(btrim("domain")) AND position('@' in "domain") = 0))
);

CREATE UNIQUE INDEX "suppressions_tenant_id_email_key" ON "suppressions"("tenant_id", "email");
CREATE UNIQUE INDEX "suppressions_tenant_id_domain_key" ON "suppressions"("tenant_id", "domain");

ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
