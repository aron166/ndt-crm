-- Resend webhooks (night 2026-11-12, plan item 4). Every signed provider event is stored once (unknown types
-- included), keyed by the provider's event id (svix-id), so a redelivery is a no-op. delivered and opened also become
-- campaign events; the campaign_events outcome CHECK is widened by two values. Additive: a new table and a wider
-- CHECK, no data change.
-- Rollback:
--   DELETE FROM "campaign_events" WHERE "outcome" IN ('email_delivered', 'email_opened');
--   ALTER TABLE "campaign_events" DROP CONSTRAINT "campaign_events_outcome_check",
--     ADD CONSTRAINT "campaign_events_outcome_check" CHECK ("outcome" IN ('no_answer', 'interested', 'wants', 'not_interested', 'bad_number', 'note_only', 'email_sent', 'reply_positive', 'reply_negative', 'unsubscribe', 'bounce'));
--   DROP TABLE "email_provider_events";
CREATE TABLE "email_provider_events" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "email" TEXT,
    "draft_id" INTEGER,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "email_provider_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_provider_events_provider_event_id_key" ON "email_provider_events"("provider", "event_id");
CREATE INDEX "email_provider_events_tenant_id_event_type_idx" ON "email_provider_events"("tenant_id", "event_type");
CREATE INDEX "email_provider_events_provider_message_id_idx" ON "email_provider_events"("provider_message_id");
ALTER TABLE "email_provider_events" ADD CONSTRAINT "email_provider_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_provider_events" ADD CONSTRAINT "email_provider_events_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "email_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "campaign_events" DROP CONSTRAINT "campaign_events_outcome_check",
    ADD CONSTRAINT "campaign_events_outcome_check" CHECK ("outcome" IN ('no_answer', 'interested', 'wants', 'not_interested', 'bad_number', 'note_only', 'email_sent', 'reply_positive', 'reply_negative', 'unsubscribe', 'bounce', 'email_delivered', 'email_opened'));
