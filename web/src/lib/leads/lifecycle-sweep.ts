import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { resolveDemoHost } from "@/lib/booking/queries";
import { getLeadTransitions } from "./queries";
import { LIFECYCLE_TASK_TAG, writeLeadTransition } from "./service";
import {
  CLOSED_STAGES, buildDigest, findTransition, planTransition, slaDeadline,
  type Digest, type DigestLead,
} from "./lifecycle";

// W2 lifecycle automations, DB side. They create TASKS and move stages along
// the transition table; nothing here sends an email, SMS or message to a lead.
// Time-based parts run from the daily cron (Vercel Hobby: once a day, 08:00
// Budapest in winter), so an SLA miss is noticed at the next morning sweep.

const SWEEP_SELECT = {
  id: true, status: true, attempts: true, assignedToId: true, offerType: true,
  nextAction: true, nextDue: true, statusEnteredAt: true, recallReason: true, recallDate: true,
  companyId: true, createdAt: true,
  company: { select: { name: true } },
  contact: { select: { personId: true, person: { select: { firstName: true, lastName: true } } } },
} as const;

type SweepLead = {
  id: number; companyId: number | null;
  company: { name: string } | null;
  contact: { personId: number | null; person: { firstName: string; lastName: string } | null } | null;
};

function who(l: SweepLead): string {
  const p = l.contact?.person;
  return p ? `${p.lastName} ${p.firstName}`.trim() : l.company?.name ?? `Lead #${l.id}`;
}

/**
 * The SLA timer (spec 4, row 1), run right after a lead is created (post-commit,
 * like the lead_created automations). Owner defaults to Péter (demoHosts.peter),
 * next action = first call, due = 1 working hour or next morning 9:30, plus the
 * call task. Fail-safe: an error is reported, never thrown into the intake.
 */
export async function startLeadLifecycle(tenantId: number, leadId: number, now: Date = new Date()): Promise<void> {
  try {
    const lead = await db.lead.findFirst({ where: { id: leadId, tenantId }, select: SWEEP_SELECT });
    if (!lead || lead.status !== "new" || lead.nextDue) return;
    const ownerId = lead.assignedToId ?? (await resolveDemoHost(tenantId, "peter"));
    const due = slaDeadline(lead.createdAt);
    const title = "Első hívás (SLA)";
    await db.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { id: leadId, tenantId },
        data: { assignedToId: ownerId, nextAction: title, nextDue: due, statusEnteredAt: lead.statusEnteredAt ?? lead.createdAt },
      });
      await tx.leadStatusHistory.create({
        data: { tenantId, leadId, fromStatus: null, toStatus: "new", event: "lead_created", at: now },
      });
      await tx.task.create({
        data: {
          tenantId, leadId, companyId: lead.companyId, personId: lead.contact?.personId ?? null,
          assignedToId: ownerId, title: `${title}: ${who(lead)}`, type: "call", category: "revenue_generating",
          status: "created", dueDate: due, setMembership: [LIFECYCLE_TASK_TAG],
        },
      });
    });
  } catch (err) {
    reportError("leads.startLeadLifecycle", err, { leadId });
  }
}

export interface SweepResult {
  slaEscalated: number;
  recallWoken: number;
  recallLost: number;
  errors: number;
}

/**
 * The daily sweep's write half: SLA escalation (new lead past its first-call
 * deadline: a task for Áron, once per lead) and recall wake-up (recall_date
 * reached: back to contacting with attempts 0; a second unreachable cycle
 * ends as lost). Each lead in its own transaction, so one bad row does not
 * stop the rest.
 */
export async function runLifecycleSweep(tenantId: number, now: Date = new Date()): Promise<SweepResult> {
  const out: SweepResult = { slaEscalated: 0, recallWoken: 0, recallLost: 0, errors: 0 };
  const table = await getLeadTransitions(tenantId);
  const aronId = await resolveDemoHost(tenantId, "aron");

  // 1. SLA missed on new leads.
  // A new lead with no timer (intake hook failed, or pre-W2) counts from its SLA deadline.
  const late = (await db.lead.findMany({
    where: { tenantId, status: "new", outcome: "open", convertedDealId: null, OR: [{ nextDue: { lt: now } }, { nextDue: null }] },
    select: SWEEP_SELECT,
  })).filter((l) => l.nextDue != null || slaDeadline(l.createdAt).getTime() < now.getTime());
  for (const lead of late) {
    try {
      const t = findTransition(table, "new", "sla_missed");
      if (!t) break;
      // Once per stay in `new` (a reopened lead escalates again).
      const already = await db.leadStatusHistory.findFirst({
        where: { tenantId, leadId: lead.id, event: "sla_missed", ...(lead.statusEnteredAt ? { at: { gte: lead.statusEnteredAt } } : {}) },
        select: { id: true },
      });
      if (already) continue;
      const plan = planTransition(lead, t, {
        tasks: [{ title: "SLA lejárt, hívd most", type: "call", dueDate: now, escalate: true }],
        nextAction: lead.nextAction ?? "Első hívás (SLA)", nextDue: lead.nextDue ?? now,
      }, now);
      if ("error" in plan) { out.errors++; continue; }
      await db.$transaction((tx) => writeLeadTransition(tx, {
        leadId: lead.id, tenantId, fromStatus: lead.status, transition: t, plan,
        companyId: lead.companyId, personId: lead.contact?.personId ?? null, who: who(lead),
        actorUserId: null, actorAgentId: "w2_sweep", escalationUserId: aronId, now,
      }));
      out.slaEscalated++;
    } catch (err) {
      out.errors++;
      reportError("leads.sweep.sla", err, { leadId: lead.id });
    }
  }

  // 2. Recall wake-up.
  const due = await db.lead.findMany({
    where: { tenantId, status: "recall", outcome: "open", convertedDealId: null, recallDate: { lte: now } },
    select: SWEEP_SELECT,
  });
  for (const lead of due) {
    try {
      const cycles = lead.recallReason === "unreachable"
        ? await db.leadStatusHistory.count({ where: { tenantId, leadId: lead.id, event: "attempts_exhausted" } })
        : 0;
      const event = cycles >= 2 ? "recall_unreachable_twice" : "recall_date_reached";
      const t = findTransition(table, "recall", event);
      if (!t) continue;
      const plan = planTransition(lead, t, {}, now);
      if ("error" in plan) { out.errors++; continue; }
      await db.$transaction((tx) => writeLeadTransition(tx, {
        leadId: lead.id, tenantId, fromStatus: lead.status, transition: t, plan,
        companyId: lead.companyId, personId: lead.contact?.personId ?? null, who: who(lead),
        actorUserId: null, actorAgentId: "w2_sweep", escalationUserId: aronId, now,
      }));
      if (event === "recall_unreachable_twice") out.recallLost++; else out.recallWoken++;
    } catch (err) {
      out.errors++;
      reportError("leads.sweep.recall", err, { leadId: lead.id });
    }
  }
  return out;
}

/**
 * The 08:00 digest (spec 4, last line): due today, overdue, past max age, no
 * next action. Returned as data + text; the Telegram send is a separate lane.
 */
export async function getDailyDigest(tenantId: number, now: Date = new Date()): Promise<Digest> {
  const rows = await db.lead.findMany({
    where: { tenantId, outcome: "open", convertedDealId: null, status: { notIn: [...CLOSED_STAGES] } },
    select: { ...SWEEP_SELECT, assignedTo: { select: { name: true } } },
    orderBy: { nextDue: { sort: "asc", nulls: "first" } },
    take: 500,
  });
  const leads: DigestLead[] = rows.map((r) => ({
    id: r.id, name: who(r), status: r.status, ownerName: r.assignedTo?.name ?? null, attempts: r.attempts,
    nextAction: r.nextAction, nextDue: r.nextDue, statusEnteredAt: r.statusEnteredAt, recallDate: r.recallDate,
  }));
  return buildDigest(leads, now);
}
