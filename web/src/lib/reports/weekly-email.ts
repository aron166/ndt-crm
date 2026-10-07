import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { sendEmail } from "@/lib/integrations/resend";
import { getContentReviewers } from "@/lib/content/reviewers";
import { callOutcomeLabel } from "@/lib/leads/outcomes";
import { leadStatusLabel, type LeadStatusDef } from "@/lib/leads/statuses";
import { getLeadStatuses } from "@/lib/leads/queries";
import { firstName } from "@/lib/content/digest";
import { REPORT_UI, formatMinutesOrDash } from "./labels";
import { getWeeklyReport, previousBudapestWeek, type WeeklyReport } from "./weekly";

/**
 * Monday weekly report email. Same split as lib/content/digest: the builder and
 * the time gate are pure, sendWeeklyReports is the only part touching the DB.
 */

const budapestDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(d);

export function buildWeeklyReportEmail(input: {
  report: WeeklyReport;
  statuses: LeadStatusDef[];
  recipientName: string;
  baseUrl: string;
}): { subject: string; text: string } {
  const { report: r, statuses, recipientName, baseUrl } = input;
  const U = REPORT_UI;
  const section = (title: string, lines: string[]): string[] => [
    title,
    ...(lines.length > 0 ? lines : [U.empty]),
    "",
  ];

  const bySource = r.leadsBySourceTier.map(
    (x) => `- ${x.source ?? U.unknown} / ${x.tier ?? U.noTier}: ${x.count}`,
  );
  const t = r.tierA;
  const tierA = t.total === 0 ? [] : [
    `- ${U.tierATotal}: ${t.total}`,
    `- ${U.contacted}: ${t.contacted}`,
    `- ${U.awaitingCall}: ${t.awaitingCall}`,
    `- ${U.withoutTask}: ${t.withoutTask}`,
    `- ${U.median}: ${formatMinutesOrDash(t.medianMinutes)}`,
    `- ${U.p90}: ${formatMinutesOrDash(t.p90Minutes)}`,
  ];
  const outcomes = r.callOutcomes.map((o) => `- ${callOutcomeLabel(o.outcome)}: ${o.count}`);
  const transitions = r.stageTransitions.map(
    (s) => `- ${leadStatusLabel(s.from, statuses)} -> ${leadStatusLabel(s.to, statuses)}: ${s.count}`,
  );
  const companies = r.topCompanies.map((c) => `- ${c.name}: ${c.touches}`);

  const text = [
    `Kedves ${firstName(recipientName)}!`,
    `Időszak: ${budapestDate(r.from)} - ${budapestDate(new Date(r.to.getTime() - 1))}`,
    "",
    ...section(`${U.leadsCreated}: ${r.leadsTotal}`, bySource),
    ...section(U.tierA, tierA),
    ...section(`${U.callOutcomes} (${U.calls}: ${r.callsTotal})`, outcomes),
    ...section(U.demos, [
      `- ${U.demosBooked}: ${r.demos.booked}`,
      `- ${U.demosScheduled}: ${r.demos.scheduled}`,
      `- ${U.demosHeld}: ${r.demos.held}`,
    ]),
    ...section(U.stageTransitions, transitions),
    ...section(U.suppression, [
      `- ${U.suppressionAdded}: ${r.suppression.added}`,
      `- ${U.suppressionCancelled}: ${r.suppression.draftsCancelled}`,
    ]),
    ...section(`${U.topCompanies} (${U.touches})`, companies),
    `A teljes riport: ${baseUrl}/reports/weekly`,
  ].join("\n");

  // PROPOSAL copy, not final until Aron approves it. Always sent: a zero week is information.
  const subject = `Heti riport: ${r.leadsTotal} lead, ${r.callsTotal} hívás, ${r.demos.booked} demó`;
  return { subject, text };
}

/**
 * Monday morning in Europe/Budapest, independent of process TZ.
 *
 * Vercel Hobby crons run once a day at a fixed UTC hour and may fire late
 * within the hour. The cron is 05:00 UTC Monday = 07:00 Budapest in summer
 * (CEST) and 06:00 in winter (CET), so the window is 06:00 to 08:59 local.
 */
export const WEEKLY_REPORT_HOURS = [6, 7, 8];
export function isWeeklyReportTime(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  return weekday === "Mon" && WEEKLY_REPORT_HOURS.includes(hour);
}

/**
 * Sends the previous full Budapest week's report to every tenant reviewer. Never throws per
 * recipient: a failure is reported and the others still get theirs.
 * `skipLog: true`: a report is not a CRM interaction with a person/company.
 */
export async function sendWeeklyReports(
  tenantId: number,
  now: Date = new Date(),
  opts: { force?: boolean } = {},
): Promise<{ sent: number; skipped: number; reason?: string }> {
  if (!opts.force && !isWeeklyReportTime(now)) {
    return { sent: 0, skipped: 0, reason: "not_report_time" };
  }

  const recipientIds = await getContentReviewers(tenantId);
  if (recipientIds.length === 0) return { sent: 0, skipped: 0, reason: "no_reviewers" };

  const baseUrl = process.env.APP_BASE_URL ?? "https://ndt-crm.vercel.app";
  // Fetched once: the same numbers go to every recipient.
  const [report, statuses] = await Promise.all([
    getWeeklyReport(tenantId, previousBudapestWeek(now)),
    getLeadStatuses(tenantId),
  ]);

  // Double-send guard, taken only after reviewers and report fetched fine so a failed
  // fetch does not burn the day. Atomically claim today's Budapest date on the tenant
  // row; only the caller that flips it from "not today" sends. `force` bypasses.
  if (!opts.force) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(now);
    const claimed = await db.$executeRaw`
      UPDATE "tenants"
         SET "settings" = jsonb_set(
               CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
               '{weeklyReportLastSentOn}', to_jsonb(${today}::text), true)
       WHERE "id" = ${tenantId}
         AND COALESCE("settings"->>'weeklyReportLastSentOn', '') <> ${today}`;
    if (claimed === 0) {
      return { sent: 0, skipped: 0, reason: "already_sent" };
    }
  }

  let sent = 0;
  let skipped = 0;
  for (const id of recipientIds) {
    try {
      const user = await db.user.findFirst({
        where: { id, tenantId },
        select: { name: true, email: true },
      });
      if (!user) {
        skipped++;
        continue;
      }
      const mail = buildWeeklyReportEmail({ report, statuses, recipientName: user.name, baseUrl });
      // Recipients are internal CRM users (the tenant's reviewers). The
      // suppression list is a prospect opt-out list and never applies to
      // internal users, so nothing here filters on it. sendEmail still runs its
      // hard suppression check on every address; an internal address on the
      // list is a data error and surfaces as a skipped send with a reported error.
      const res = await sendEmail({ tenantId, to: user.email, subject: mail.subject, text: mail.text, skipLog: true });
      if (res.ok) {
        sent++;
      } else {
        skipped++;
        reportError("reports.weekly", new Error(res.error), { userId: id });
      }
    } catch (err) {
      skipped++;
      reportError("reports.weekly", err, { userId: id });
    }
  }

  // A run that delivered nothing must not burn the day: release the claim so a manual
  // CRON_SECRET re-run (without force) can retry.
  if (!opts.force && sent === 0) {
    await db.$executeRaw`UPDATE "tenants" SET "settings" = "settings" - 'weeklyReportLastSentOn' WHERE "id" = ${tenantId}`;
  }

  return { sent, skipped };
}
