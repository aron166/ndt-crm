-- Cold-email reply intake (BRIEFING_2026-09-04 addendum, item 3).
--
-- `leads.thread_key` is the stable handle for the email thread a reply came
-- back on; `threadKeyFor(campaign, companyId)` writes the same string onto the
-- sent draft. It is the IDEMPOTENCY key for POST /api/leads — the reply-intake
-- skill is schedulable and will see the same Gmail thread again on its next
-- run, and a duplicate lead for one answered email is worse than no lead.
--
-- The unique index is what makes idempotency a guarantee rather than a
-- convention: two concurrent posts for one thread cannot both win. Postgres
-- treats NULLs as distinct, so the millions of leads without a thread key are
-- unaffected and no partial-index clause is needed.
--
-- Additive + nullable: the currently deployed code keeps running unchanged.
-- Rollback: DROP INDEX "leads_tenant_id_thread_key_key"; ALTER TABLE "leads" DROP COLUMN "thread_key";

ALTER TABLE "leads" ADD COLUMN "thread_key" TEXT;

CREATE UNIQUE INDEX "leads_tenant_id_thread_key_key" ON "leads"("tenant_id", "thread_key");
