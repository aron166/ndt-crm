import { db } from "@/lib/db";
import { CALL_OUTCOMES } from "@/lib/leads/outcomes";

/**
 * Weekly sales-engine report (growth playbook M7). Pure read, tenant-scoped,
 * ONE query per metric (7 per report). Shared by GET /api/reports/weekly, the
 * /reports/weekly page and the Monday cron email, so all three show the same
 * numbers. The pure helpers (window parsing, percentile, tier-A summary) carry
 * the logic and are unit-tested; the queries only fetch rows.
 *
 * Definitions (keep in sync with docs/api.md):
 * - window: [from, to) in UTC.
 * - call outcome: an interaction of type `call` whose outcome is one of the six
 *   CALL_OUTCOMES keys (so `transcribed` queue rows never count). Superseded rows
 *   (a human correction of an auto-outcome) are skipped: the latest word counts.
 * - tier-A time to first contact: from the lead's first `call` task (the #118
 *   rule creates it at intake) to the first logged call outcome on that lead.
 * - demo held: a lead booking task (type meeting, starts_at set) starting in the
 *   window with status `done`.
 * - stage transition: a lead audit row whose before/after `status` differ.
 * - suppression hit: a suppression added in the window, or an email draft the
 *   suppression list cancelled (audit reason `suppressed`). Sends blocked inside
 *   sendEmail are not persisted anywhere, so they are not counted.
 * - company touched: any non-superseded interaction linked to the company.
 */

export const REPORT_QUERY_COUNT = 7;
export const MAX_WINDOW_DAYS = 92;
const DAY_MS = 86_400_000;
const CALL_OUTCOME_KEYS: string[] = CALL_OUTCOMES.map((o) => o.key);

export interface ReportWindow { from: Date; to: Date }

/** Parse ?from=&to= (ISO date or datetime). Default: the 7 days ending now. */
export function parseWindow(
  fromRaw: string | null,
  toRaw: string | null,
  now: Date = new Date(),
): ReportWindow | { error: string } {
  const to = toRaw ? new Date(toRaw) : now;
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 7 * DAY_MS);
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) return { error: "Invalid date" };
  if (from.getTime() >= to.getTime()) return { error: "from must be before to" };
  if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    return { error: `Window longer than ${MAX_WINDOW_DAYS} days` };
  }
  return { from, to };
}

/** The `days` days ending at `now`. */
export function lastDays(days: number, now: Date = new Date()): ReportWindow {
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
}

/**
 * Percentile with linear interpolation between closest ranks (same as
 * Postgres percentile_cont). p in [0, 1]. Empty input -> null.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = p * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
}

export interface TierALeadRow {
  leadId: number;
  companyName: string | null;
  createdAt: Date;
  taskAt: Date | null;
  firstCallAt: Date | null;
}

export interface TierASummary {
  total: number;
  /** Tier A leads with no call task (tier set after intake, or the rule was off). */
  withoutTask: number;
  /** Have a task, no call outcome logged yet. */
  awaitingCall: number;
  contacted: number;
  medianMinutes: number | null;
  p90Minutes: number | null;
  leads: (TierALeadRow & { minutesToContact: number | null })[];
}

export function summarizeTierA(rows: TierALeadRow[]): TierASummary {
  const leads = rows.map((r) => ({
    ...r,
    // A call logged before the task existed is "instant", never negative.
    minutesToContact: r.taskAt && r.firstCallAt
      ? Math.max(0, (r.firstCallAt.getTime() - r.taskAt.getTime()) / 60_000)
      : null,
  }));
  const minutes = leads.flatMap((l) => (l.minutesToContact === null ? [] : [l.minutesToContact]));
  const round = (n: number | null) => (n === null ? null : Math.round(n));
  return {
    total: rows.length,
    withoutTask: rows.filter((r) => !r.taskAt).length,
    awaitingCall: rows.filter((r) => r.taskAt && !r.firstCallAt).length,
    contacted: minutes.length,
    medianMinutes: round(percentile(minutes, 0.5)),
    p90Minutes: round(percentile(minutes, 0.9)),
    leads,
  };
}

export interface WeeklyReport {
  from: Date;
  to: Date;
  leadsBySourceTier: { source: string | null; tier: string | null; count: number }[];
  leadsTotal: number;
  tierA: TierASummary;
  callOutcomes: { outcome: string; count: number }[];
  callsTotal: number;
  demos: { booked: number; scheduled: number; held: number };
  stageTransitions: { from: string | null; to: string; count: number }[];
  suppression: { added: number; draftsCancelled: number };
  topCompanies: { companyId: number; name: string; touches: number; lastTouchAt: Date }[];
}

const sum = (rows: { count: number }[]) => rows.reduce((a, r) => a + r.count, 0);

export async function getWeeklyReport(tenantId: number, { from, to }: ReportWindow): Promise<WeeklyReport> {
  const [bySource, tierARows, outcomes, demoRows, transitions, suppressionRows, companies] = await Promise.all([
    db.$queryRaw<{ source: string | null; tier: string | null; count: number }[]>`
      SELECT COALESCE(l."channel", l."source") AS "source", l."tier", COUNT(*)::int AS "count"
        FROM "leads" l
       WHERE l."tenant_id" = ${tenantId} AND l."created_at" >= ${from} AND l."created_at" < ${to}
       GROUP BY 1, 2
       ORDER BY 3 DESC`,

    db.$queryRaw<TierALeadRow[]>`
      SELECT l."id" AS "leadId", c."name" AS "companyName", l."created_at" AS "createdAt",
             t."taskAt", i."firstCallAt"
        FROM "leads" l
        LEFT JOIN "companies" c ON c."id" = l."company_id" AND c."tenant_id" = l."tenant_id"
        LEFT JOIN LATERAL (
          SELECT MIN(tk."created_at") AS "taskAt" FROM "tasks" tk
           WHERE tk."tenant_id" = l."tenant_id" AND tk."lead_id" = l."id" AND tk."type" = 'call'
        ) t ON true
        LEFT JOIN LATERAL (
          SELECT MIN(it."occurred_at") AS "firstCallAt" FROM "interactions" it
           WHERE it."tenant_id" = l."tenant_id" AND it."lead_id" = l."id" AND it."type" = 'call'
             AND it."outcome" = ANY(${CALL_OUTCOME_KEYS})
        ) i ON true
       WHERE l."tenant_id" = ${tenantId} AND l."tier" = 'A'
         AND l."created_at" >= ${from} AND l."created_at" < ${to}
       ORDER BY l."created_at"`,

    db.$queryRaw<{ outcome: string; count: number }[]>`
      SELECT i."outcome", COUNT(*)::int AS "count"
        FROM "interactions" i
       WHERE i."tenant_id" = ${tenantId} AND i."type" = 'call'
         AND i."outcome" = ANY(${CALL_OUTCOME_KEYS})
         AND i."occurred_at" >= ${from} AND i."occurred_at" < ${to}
         AND NOT EXISTS (SELECT 1 FROM "interactions" s WHERE s."supersedes_interaction_id" = i."id")
       GROUP BY 1
       ORDER BY 2 DESC`,

    db.$queryRaw<{ booked: number; scheduled: number; held: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "interactions" i
          WHERE i."tenant_id" = ${tenantId} AND i."type" = 'call' AND i."outcome" = 'meeting_booked'
            AND i."occurred_at" >= ${from} AND i."occurred_at" < ${to}
            AND NOT EXISTS (SELECT 1 FROM "interactions" s WHERE s."supersedes_interaction_id" = i."id")
        ) AS "booked",
        COUNT(*)::int AS "scheduled",
        (COUNT(*) FILTER (WHERE t."status" = 'done'))::int AS "held"
        FROM "tasks" t
       WHERE t."tenant_id" = ${tenantId} AND t."lead_id" IS NOT NULL AND t."type" = 'meeting'
         AND t."starts_at" >= ${from} AND t."starts_at" < ${to}`,

    db.$queryRaw<{ from: string | null; to: string; count: number }[]>`
      SELECT a."changes"->'before'->>'status' AS "from", a."changes"->'after'->>'status' AS "to",
             COUNT(*)::int AS "count"
        FROM "audit_log" a
       WHERE a."tenant_id" = ${tenantId} AND a."entity_type" = 'lead' AND a."action" = 'update'
         AND a."occurred_at" >= ${from} AND a."occurred_at" < ${to}
         AND a."changes"->'after'->>'status' IS NOT NULL
         AND (a."changes"->'before'->>'status') IS DISTINCT FROM (a."changes"->'after'->>'status')
       GROUP BY 1, 2
       ORDER BY 3 DESC`,

    db.$queryRaw<{ added: number; draftsCancelled: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "suppressions" s
          WHERE s."tenant_id" = ${tenantId} AND s."created_at" >= ${from} AND s."created_at" < ${to}) AS "added",
        (SELECT COUNT(*)::int FROM "audit_log" a
          WHERE a."tenant_id" = ${tenantId} AND a."entity_type" = 'email_draft'
            AND a."occurred_at" >= ${from} AND a."occurred_at" < ${to}
            AND a."changes"->'after'->>'reason' = 'suppressed') AS "draftsCancelled"`,

    db.$queryRaw<{ companyId: number; name: string; touches: number; lastTouchAt: Date }[]>`
      SELECT c."id" AS "companyId", c."name", COUNT(*)::int AS "touches", MAX(i."occurred_at") AS "lastTouchAt"
        FROM "interactions" i
        JOIN "companies" c ON c."id" = i."company_id" AND c."tenant_id" = i."tenant_id"
       WHERE i."tenant_id" = ${tenantId} AND i."occurred_at" >= ${from} AND i."occurred_at" < ${to}
         AND NOT EXISTS (SELECT 1 FROM "interactions" s WHERE s."supersedes_interaction_id" = i."id")
       GROUP BY c."id", c."name"
       ORDER BY 3 DESC, 4 DESC
       LIMIT 10`,
  ]);

  return {
    from,
    to,
    leadsBySourceTier: bySource,
    leadsTotal: sum(bySource),
    tierA: summarizeTierA(tierARows),
    callOutcomes: outcomes,
    callsTotal: sum(outcomes),
    demos: demoRows[0] ?? { booked: 0, scheduled: 0, held: 0 },
    stageTransitions: transitions,
    suppression: suppressionRows[0] ?? { added: 0, draftsCancelled: 0 },
    topCompanies: companies,
  };
}
