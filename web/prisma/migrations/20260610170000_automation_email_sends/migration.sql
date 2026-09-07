-- send_email "send once per recipient" dedup ledger.
CREATE TABLE "automation_email_sends" (
  "id"        SERIAL NOT NULL,
  "tenant_id" INTEGER NOT NULL,
  "rule_id"   INTEGER NOT NULL,
  "recipient" TEXT NOT NULL,
  "sent_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_email_sends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_email_sends_rule_id_recipient_key" ON "automation_email_sends"("rule_id", "recipient");
CREATE INDEX "automation_email_sends_tenant_id_idx" ON "automation_email_sends"("tenant_id");

ALTER TABLE "automation_email_sends" ADD CONSTRAINT "automation_email_sends_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "automation_email_sends" ADD CONSTRAINT "automation_email_sends_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
