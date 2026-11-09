-- W2 lead lifecycle (spec: workspace docs/birdsview/gtm-system-2026-11-08/W2-lifecycle-spec.md).
-- One pipeline: new > contacting > discovery_booked > qualified > offer_sent >
-- demo_booked > demo_done > ordered > won, side states recall + lost.
-- Owner = the existing leads.assigned_to_id (a user FK), not a new column.
-- Approved by Áron for W2 (2026-11-08). Touches tenant 1 data only; no shared auth table.
--
-- Rollback (before any new-stage writes):
--   UPDATE leads l SET status = CASE
--     WHEN h.from_status IS NOT NULL THEN h.from_status ELSE l.status END
--     FROM lead_status_history h WHERE h.lead_id = l.id AND h.event = 'w2_migrated';
--   UPDATE leads SET lost_reason = lost_note WHERE lost_reason = 'other' AND lost_note IS NOT NULL;
--   (old lead_statuses rows: re-insert from 20260904100000 or the pre-migration dump)
--   DROP TABLE lead_status_history; DROP TABLE lead_status_transitions;
--   ALTER TABLE leads DROP COLUMN buyer_type, DROP COLUMN intent, DROP COLUMN offer_type,
--     DROP COLUMN attempts, DROP COLUMN next_action, DROP COLUMN next_due,
--     DROP COLUMN status_entered_at, DROP COLUMN recall_reason, DROP COLUMN recall_date,
--     DROP COLUMN lost_note, DROP COLUMN demo_done_at, DROP COLUMN demo_credit_until;
--   assigned_to_id values set below are kept (they are correct owners either way).

-- 1. New lead fields (spec section 3).
ALTER TABLE "leads"
    ADD COLUMN "buyer_type" TEXT,
    ADD COLUMN "intent" TEXT,
    ADD COLUMN "offer_type" TEXT,
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "next_action" TEXT,
    ADD COLUMN "next_due" TIMESTAMP(3),
    ADD COLUMN "status_entered_at" TIMESTAMP(3),
    ADD COLUMN "recall_reason" TEXT,
    ADD COLUMN "recall_date" TIMESTAMP(3),
    ADD COLUMN "lost_note" TEXT,
    ADD COLUMN "demo_done_at" TIMESTAMP(3),
    ADD COLUMN "demo_credit_until" TIMESTAMP(3),
    ADD CONSTRAINT "leads_buyer_type_check" CHECK ("buyer_type" IN ('company', 'private')),
    ADD CONSTRAINT "leads_intent_check" CHECK ("intent" IN ('service_concrete', 'service_vague', 'rental', 'purchase', 'unknown')),
    ADD CONSTRAINT "leads_offer_type_check" CHECK ("offer_type" IN ('service', 'rental', 'purchase')),
    ADD CONSTRAINT "leads_attempts_check" CHECK ("attempts" BETWEEN 0 AND 8),
    ADD CONSTRAINT "leads_recall_reason_check" CHECK ("recall_reason" IN ('timing', 'budget_cycle', 'no_decision', 'unreachable', 'no_show'));

CREATE INDEX "leads_tenant_id_next_due_idx" ON "leads"("tenant_id", "next_due");

-- 2. Allowed transitions (spec section 4) + the append-only history.
CREATE TABLE "lead_status_transitions" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "from_status" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "action" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_status_transitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_status_transitions_tenant_id_from_status_event_key"
    ON "lead_status_transitions"("tenant_id", "from_status", "event");
ALTER TABLE "lead_status_transitions" ADD CONSTRAINT "lead_status_transitions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "lead_status_history" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actor_user_id" INTEGER,
    "actor_agent_id" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lead_status_history_tenant_id_lead_id_at_idx" ON "lead_status_history"("tenant_id", "lead_id", "at");
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed for tenant 1, generated from DEFAULT_TRANSITIONS in web/src/lib/leads/lifecycle.ts.
INSERT INTO "lead_status_transitions" ("tenant_id", "from_status", "event", "to_status", "action") VALUES
    (1, 'new', 'call_no_answer', 'contacting', 'next call per cadence'),
    (1, 'new', 'call_meeting_booked', 'discovery_booked', 'calendar event + recap'),
    (1, 'new', 'call_qualified', 'qualified', 'set offer_type'),
    (1, 'new', 'call_not_now', 'recall', 'recall_date = their date'),
    (1, 'new', 'call_no_fit', 'lost', 'lost_reason'),
    (1, 'new', 'call_wrong_number', 'lost', 'lost_reason invalid_contact'),
    (1, 'new', 'sla_missed', 'new', 'escalation task to Áron'),
    (1, 'contacting', 'call_no_answer', 'contacting', 'next call per cadence'),
    (1, 'contacting', 'call_meeting_booked', 'discovery_booked', 'calendar event + recap'),
    (1, 'contacting', 'call_qualified', 'qualified', 'set offer_type'),
    (1, 'contacting', 'call_not_now', 'recall', 'recall_date = their date'),
    (1, 'contacting', 'call_no_fit', 'lost', 'lost_reason'),
    (1, 'contacting', 'call_wrong_number', 'lost', 'lost_reason invalid_contact'),
    (1, 'contacting', 'attempts_exhausted', 'recall', 'closing email task, recall unreachable 60 d'),
    (1, 'discovery_booked', 'meeting_no_show', 'discovery_booked', 'call + email, rebook (max 2)'),
    (1, 'discovery_booked', 'meeting_no_show_twice', 'recall', 'closing email task, recall no_show'),
    (1, 'discovery_booked', 'meeting_done_fit', 'qualified', 'set offer_type, notes'),
    (1, 'discovery_booked', 'meeting_done_no_fit', 'lost', 'lost_reason'),
    (1, 'qualified', 'offer_sent', 'offer_sent', 'follow-up call tasks day 2, 5, 10'),
    (1, 'offer_sent', 'demo_booked', 'demo_booked', 'calendar event, payment terms'),
    (1, 'offer_sent', 'call_meeting_booked', 'demo_booked', 'calendar event, payment terms'),
    (1, 'offer_sent', 'offer_accepted', 'ordered', 'deposit/invoice, payment check task'),
    (1, 'offer_sent', 'offer_silent', 'offer_sent', 'follow-up call'),
    (1, 'offer_sent', 'offer_expired', 'recall', 'closing email task, recall no_decision'),
    (1, 'offer_sent', 'offer_declined', 'lost', 'lost_reason'),
    (1, 'demo_booked', 'demo_delivered', 'demo_done', 'report + decision call task, demo credit clock'),
    (1, 'demo_booked', 'demo_cancelled', 'recall', 'ask reason'),
    (1, 'demo_booked', 'demo_declined', 'lost', 'lost_reason'),
    (1, 'demo_done', 'order_placed', 'ordered', 'credit applied if within 30 days, payment check task'),
    (1, 'demo_done', 'demo_followed_up', 'demo_done', 'follow-up day 3, 7, 14'),
    (1, 'demo_done', 'demo_expired', 'recall', 'closing email task, recall no_decision'),
    (1, 'ordered', 'order_won', 'won', 'handover task'),
    (1, 'ordered', 'payment_reminded', 'ordered', 'payment reminder call; day 15 escalate to Áron'),
    (1, 'recall', 'recall_date_reached', 'contacting', 'review note, one personal touch'),
    (1, 'recall', 'recall_unreachable_twice', 'lost', 'none'),
    (1, 'new', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'discovery_booked', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'qualified', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'offer_sent', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'demo_booked', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'demo_done', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'ordered', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'recall', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'contacting', 'inbound_received', 'contacting', 'call task, nurture paused'),
    (1, 'lost', 'inbound_received', 'new', 'history shown'),
    (1, 'new', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'contacting', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'discovery_booked', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'qualified', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'offer_sent', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'demo_booked', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'demo_done', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'ordered', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'recall', 'lead_lost', 'lost', 'lost_reason (manual close)'),
    (1, 'lost', 'lead_reopened', 'new', 'call task');

-- 3. Map tenant 1 leads onto the new keys. Owners come from tenants.settings.demoHosts
--    (the same map resolveDemoHost reads): peter = Péter, aron = Áron.
CREATE TEMP TABLE w2_map AS
SELECT l.id, l.status AS old_status,
    CASE
        WHEN l.outcome = 'lost' THEN 'lost'
        WHEN l.outcome = 'won' THEN 'won'
        WHEN l.status IN ('call_1', 'call_2', 'call_3', 'call_3_plus') THEN 'contacting'
        WHEN l.status IN ('demo_aron', 'demo_peter') THEN 'demo_booked'
        ELSE l.status
    END AS new_status,
    CASE l.status WHEN 'call_1' THEN 1 WHEN 'call_2' THEN 2 WHEN 'call_3' THEN 3 WHEN 'call_3_plus' THEN 4 ELSE 0 END AS attempts,
    COALESCE(l.assigned_to_id,
        CASE WHEN l.status = 'demo_aron' THEN (t.settings->'demoHosts'->>'aron')::int
             ELSE (t.settings->'demoHosts'->>'peter')::int END) AS owner_id
FROM "leads" l JOIN "tenants" t ON t.id = l.tenant_id
WHERE l.tenant_id = 1;

DO $$
DECLARE bad TEXT;
BEGIN
    SELECT string_agg(id || ':' || COALESCE(new_status, 'NULL'), ', ') INTO bad FROM w2_map
    WHERE new_status IS NULL OR new_status NOT IN
        ('new', 'contacting', 'discovery_booked', 'qualified', 'offer_sent', 'demo_booked',
         'demo_done', 'ordered', 'won', 'recall', 'lost');
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'W2: leads with no mapping: %', bad; END IF;
    IF EXISTS (SELECT 1 FROM w2_map m JOIN "users" u ON u.id = m.owner_id WHERE u.tenant_id <> 1)
        OR EXISTS (SELECT 1 FROM w2_map WHERE owner_id IS NULL) THEN
        RAISE EXCEPTION 'W2: owner unresolved (tenants.settings.demoHosts)';
    END IF;
END $$;

INSERT INTO "lead_status_history" ("tenant_id", "lead_id", "from_status", "to_status", "event", "at")
SELECT 1, m.id, m.old_status, m.new_status, 'w2_migrated', CURRENT_TIMESTAMP
FROM w2_map m WHERE m.old_status IS DISTINCT FROM m.new_status;

UPDATE "leads" l SET
    "status" = m.new_status,
    "attempts" = m.attempts,
    "assigned_to_id" = m.owner_id,
    "status_entered_at" = l.created_at,
    -- Lost now needs a reason CODE: legacy free text moves to the note.
    "lost_note" = CASE WHEN m.new_status = 'lost' AND l.lost_reason IS NOT NULL
        AND l.lost_reason NOT IN ('invalid_contact', 'not_our_service', 'no_need', 'did_in_house',
            'chose_competitor', 'price', 'project_cancelled', 'bought_machine_elsewhere', 'unreachable', 'other')
        THEN l.lost_reason ELSE l.lost_note END,
    "lost_reason" = CASE WHEN m.new_status = 'lost' AND (l.lost_reason IS NULL OR l.lost_reason NOT IN
        ('invalid_contact', 'not_our_service', 'no_need', 'did_in_house', 'chose_competitor', 'price',
         'project_cancelled', 'bought_machine_elsewhere', 'unreachable', 'other'))
        THEN 'other' ELSE l.lost_reason END
FROM w2_map m WHERE l.id = m.id;

UPDATE "leads" SET "status_entered_at" = "created_at" WHERE "status_entered_at" IS NULL;

-- 3b. Every open lead leaves with a next action (spec rule 2): take it from the
--     lead's earliest open call task; recall leads get that date as recall_date;
--     the rest get a "fill in the next step" action due now, so the 08:00 digest
--     lists them instead of the sweep missing them.
UPDATE "leads" l SET "next_action" = t.title, "next_due" = t.due_date
FROM (SELECT DISTINCT ON ("lead_id") "lead_id", "title", "due_date" FROM "tasks"
      WHERE "tenant_id" = 1 AND "type" = 'call' AND "status" IN ('created', 'in_progress') AND "due_date" IS NOT NULL
      ORDER BY "lead_id", "due_date") t
WHERE l.id = t.lead_id AND l.tenant_id = 1 AND l.outcome = 'open' AND l.status NOT IN ('won', 'lost');
UPDATE "leads" SET "recall_reason" = 'timing', "recall_date" = COALESCE("next_due", CURRENT_TIMESTAMP)
WHERE "tenant_id" = 1 AND "status" = 'recall' AND "recall_date" IS NULL;
UPDATE "leads" SET "next_action" = 'Következő lépés pótlása', "next_due" = CURRENT_TIMESTAMP
WHERE "tenant_id" = 1 AND "outcome" = 'open' AND "status" NOT IN ('won', 'lost') AND "next_due" IS NULL;

-- 4. Tenant 1 board columns: the new keys (labels are PROPOSAL until Áron approves).
DELETE FROM "lead_statuses" WHERE "tenant_id" = 1
    AND "key" IN ('call_1', 'call_2', 'call_3', 'call_3_plus', 'demo_aron', 'demo_peter');
UPDATE "lead_statuses" SET "position" = 0, "label" = 'Új', "is_initial" = true WHERE "tenant_id" = 1 AND "key" = 'new';
UPDATE "lead_statuses" SET "position" = 9, "label" = 'Visszahívás' WHERE "tenant_id" = 1 AND "key" = 'recall';
INSERT INTO "lead_statuses" ("tenant_id", "key", "label", "color", "position", "is_initial", "is_terminal", "is_commitment", "description") VALUES
    (1, 'contacting',       'Hívás alatt',           '#3b82f6', 1,  false, false, false, 'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'discovery_booked', 'Egyeztetés foglalva',   '#8b5cf6', 2,  false, false, false, 'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'qualified',        'Minősítve',             '#a855f7', 3,  false, false, false, 'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'offer_sent',       'Ajánlat kiküldve',      '#f59e0b', 4,  false, false, false, 'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'demo_booked',      'Demó foglalva',         '#22c55e', 5,  false, false, false, 'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'demo_done',        'Demó kész',             '#16a34a', 6,  false, false, false, 'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'ordered',          'Megrendelve',           '#0ea5e9', 7,  false, false, true,  'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'won',              'Megnyert',              '#15803d', 8,  false, false, false, 'TODO: mit csinálunk ebben a fázisban, hol a script'),
    (1, 'lost',             'Elveszett',             '#6b7280', 10, false, true,  false, 'TODO: mit csinálunk ebben a fázisban, hol a script')
ON CONFLICT ("tenant_id", "key") DO NOTHING;

DROP TABLE w2_map;
