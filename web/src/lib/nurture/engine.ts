import "server-only";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { sendEmail } from "@/lib/integrations/resend";
import { isAddressSuppressed } from "@/lib/suppression";
import { offerConfigFromSettings } from "@/lib/offers/offer";
import { decide, hasNewsletterOptIn, segmentFor, templateBlock, type Activity, type Segment, type Step } from "./plan";
import { renderBody } from "./render";
import { signPayload } from "./token";

// W9 nurture, DB side: enrol, pause / resume, send due steps. Runs from the daily cron.
// Nothing sends unless tenants.settings.nurture_enabled === true AND the template is
// approved by Áron AND its asset exists AND the address is not suppressed. Every send
// and every skip leaves an app_events row ("nurture_*"), so delivery is checkable from the DB.

const BASE = process.env.APP_BASE_URL ?? "https://ndt-crm.vercel.app";
const DAY = 86_400_000;

export interface NurtureRunResult { enrolled: number; paused: number; resumed: number; sent: number; skipped: number; stopped: number; completed: number; errors: number }

async function event(tenantId: number, eventType: string, payload: Record<string, unknown>) {
  try {
    await db.appEvent.create({ data: { tenantId, sourceApp: "ndt-crm", eventType, payload: payload as never } });
  } catch (err) {
    reportError(`nurture.event.${eventType}`, err, { leadId: payload.leadId as number });
  }
}

/**
 * A skip is logged once per enrollment, step and reason per 6 days: while sending is
 * off or a template waits for Áron, the daily run would otherwise log the same skip every day.
 */
async function skipOnce(tenantId: number, payload: { leadId: number; enrollmentId: number; templateKey: string; position: number; reason: string; error?: string }) {
  const seen = await db.appEvent.findFirst({
    where: {
      tenantId, eventType: "nurture_skipped", createdAt: { gte: new Date(Date.now() - 6 * DAY) },
      AND: [
        { payload: { path: ["enrollmentId"], equals: payload.enrollmentId } },
        { payload: { path: ["position"], equals: payload.position } },
        { payload: { path: ["reason"], equals: payload.reason } },
      ],
    },
    select: { id: true },
  });
  if (!seen) await event(tenantId, "nurture_skipped", payload);
}

const leadEmail = (cf: Record<string, unknown> | null, contactEmail: string | null | undefined) =>
  (typeof cf?.contact_email === "string" && cf.contact_email.trim()) || contactEmail || null;

/** Human activity on a lead since `since`: replies, calls, bookings, stage changes. */
async function activitiesFor(tenantId: number, leadId: number, since: Date): Promise<Activity[]> {
  const [interactions, bookings, moves] = await Promise.all([
    db.interaction.findMany({
      where: { tenantId, leadId, occurredAt: { gte: since }, OR: [{ type: "call" }, { type: "email", direction: "inbound" }] },
      select: { type: true, occurredAt: true },
    }),
    db.task.findMany({ where: { tenantId, leadId, startsAt: { not: null }, createdAt: { gte: since } }, select: { createdAt: true } }),
    // Stage changes by people or the lifecycle; the creation row is not a change.
    db.leadStatusHistory.findMany({ where: { tenantId, leadId, at: { gte: since }, event: { not: "lead_created" } }, select: { at: true, fromStatus: true, toStatus: true } }),
  ]);
  return [
    ...interactions.map((i) => ({ at: i.occurredAt, kind: (i.type === "call" ? "call" : "reply") as Activity["kind"] })),
    ...bookings.map((b) => ({ at: b.createdAt, kind: "booking" as const })),
    // Only real moves: self-transitions (sla_missed, a no-answer attempt) are not a conversation (Vanda W9-5).
    ...moves.filter((m) => m.fromStatus !== m.toStatus).map((m) => ({ at: m.at, kind: "stage_change" as const })),
  ];
}

export async function runNurture(tenantId: number, now: Date = new Date()): Promise<NurtureRunResult> {
  const out: NurtureRunResult = { enrolled: 0, paused: 0, resumed: 0, sent: 0, skipped: 0, stopped: 0, completed: 0, errors: 0 };
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const enabled = settings.nurture_enabled === true;
  const assets = Array.isArray(settings.nurture_assets) ? settings.nurture_assets.filter((a): a is string => typeof a === "string") : [];
  const issuer = offerConfigFromSettings(tenant?.settings).issuer;

  // All sequences: a paused (inactive) one keeps its enrolments untouched, it is only not advanced
  // or enrolled into (Vanda #165-6).
  const sequences = await db.nurtureSequence.findMany({
    where: { tenantId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  const inactive = new Set(sequences.filter((s) => !s.active).map((s) => s.id));
  const bySegment = new Map(sequences.filter((s) => s.active).map((s) => [s.segment as Segment, s]));
  if (bySegment.size === 0) return out;

  // 1. Enrol and re-segment. shortcut: scans up to 1000 leads per run; page it when the CRM grows past that.
  const leads = await db.lead.findMany({
    where: { tenantId },
    select: {
      id: true, intent: true, status: true, outcome: true, convertedDealId: true, qualification: true, customFields: true,
      contact: { select: { email: true } },
      nurtureEnrollments: { select: { id: true, sequenceId: true, status: true } },
    },
    orderBy: { id: "desc" },
    take: 1000,
  });
  for (const lead of leads) {
    try {
      const segment = segmentFor({
        intent: lead.intent, status: lead.status, outcome: lead.outcome, convertedDealId: lead.convertedDealId,
        qualification: lead.qualification as Record<string, unknown> | null, customFields: lead.customFields as Record<string, unknown> | null,
      });
      const target = segment ? bySegment.get(segment) : undefined;
      // Any live enrollment in another sequence (or with no segment any more) stops.
      for (const en of lead.nurtureEnrollments) {
        if ((en.status === "active" || en.status === "paused") && en.sequenceId !== target?.id && !inactive.has(en.sequenceId)) {
          await db.nurtureEnrollment.updateMany({ where: { id: en.id, tenantId }, data: { status: "stopped", stoppedReason: segment ? "segment_changed" : "not_eligible" } });
          await event(tenantId, "nurture_stopped", { leadId: lead.id, enrollmentId: en.id, reason: segment ? "segment_changed" : "not_eligible" });
          out.stopped++;
        }
      }
      if (!target || lead.nurtureEnrollments.some((en) => en.sequenceId === target.id)) continue;
      const email = leadEmail(lead.customFields as Record<string, unknown> | null, lead.contact?.email);
      if (!email || (await isAddressSuppressed(tenantId, email))) continue;
      const en = await db.nurtureEnrollment.create({ data: { tenantId, leadId: lead.id, sequenceId: target.id, enrolledAt: now } });
      await event(tenantId, "nurture_enrolled", { leadId: lead.id, enrollmentId: en.id, segment });
      out.enrolled++;
    } catch (err) {
      out.errors++;
      reportError("nurture.enrol", err, { leadId: lead.id });
    }
  }

  // 2. Advance live enrollments.
  const live = await db.nurtureEnrollment.findMany({
    where: { tenantId, status: { in: ["active", "paused"] } },
    include: {
      lead: {
        select: {
          id: true, qualification: true, customFields: true, companyId: true,
          intent: true, status: true, outcome: true, convertedDealId: true,
          contact: { select: { email: true, personId: true } }, assignedTo: { select: { name: true } },
        },
      },
    },
  });
  const templates = await db.nurtureTemplate.findMany({ where: { tenantId } });
  const templateByKey = new Map(templates.map((t) => [t.key, t]));

  for (const en of live) {
    try {
      const seq = sequences.find((s) => s.id === en.sequenceId);
      if (!seq || !seq.active) continue;
      const lead = en.lead;
      const cf = lead.customFields as Record<string, unknown> | null;
      // Re-check eligibility here too, so a lead outside the enrolment scan window
      // that became won / ordered / ineligible is still stopped (Vanda W9-6).
      const nowSegment = segmentFor({
        intent: lead.intent, status: lead.status, outcome: lead.outcome, convertedDealId: lead.convertedDealId,
        qualification: lead.qualification as Record<string, unknown> | null, customFields: cf,
      });
      if (nowSegment !== seq.segment) {
        await db.nurtureEnrollment.updateMany({ where: { id: en.id, tenantId }, data: { status: "stopped", stoppedReason: nowSegment ? "segment_changed" : "not_eligible" } });
        await event(tenantId, "nurture_stopped", { leadId: lead.id, enrollmentId: en.id, reason: nowSegment ? "segment_changed" : "not_eligible" });
        out.stopped++;
        continue;
      }
      const email = leadEmail(cf, lead.contact?.email);
      if (!email || (await isAddressSuppressed(tenantId, email))) {
        await db.nurtureEnrollment.updateMany({ where: { id: en.id, tenantId }, data: { status: "stopped", stoppedReason: email ? "unsubscribed" : "no_email" } });
        await event(tenantId, "nurture_stopped", { leadId: lead.id, enrollmentId: en.id, reason: email ? "unsubscribed" : "no_email" });
        out.stopped++;
        continue;
      }
      const optIn = hasNewsletterOptIn({ qualification: lead.qualification as Record<string, unknown> | null });
      const activities = await activitiesFor(tenantId, lead.id, new Date(Math.min(en.enrolledAt.getTime(), now.getTime() - 30 * DAY)));
      const steps: Step[] = seq.steps.map((s) => ({ position: s.position, delayDays: s.delayDays, templateKey: s.templateKey, audience: s.audience as Step["audience"] }));
      const d = decide(
        { status: en.status as "active" | "paused", nextPosition: en.nextPosition, enrolledAt: en.enrolledAt, pausedAt: en.pausedAt, resumedAt: en.resumedAt, lastSentAt: en.lastSentAt },
        steps, activities, optIn, now,
      );
      if (d.kind === "pause") {
        await db.nurtureEnrollment.updateMany({ where: { id: en.id, tenantId, status: "active" }, data: { status: "paused", pausedAt: now, pauseReason: d.reason } });
        await event(tenantId, "nurture_paused", { leadId: lead.id, enrollmentId: en.id, reason: d.reason });
        out.paused++;
        continue;
      }
      if (d.kind === "resume") {
        // The remaining steps keep their spacing: the enrolment clock moves by the pause length.
        const shift = en.pausedAt ? now.getTime() - en.pausedAt.getTime() : 0;
        await db.nurtureEnrollment.updateMany({
          where: { id: en.id, tenantId, status: "paused" },
          data: { status: "active", resumedAt: now, pausedAt: null, pauseReason: null, enrolledAt: new Date(en.enrolledAt.getTime() + shift) },
        });
        await event(tenantId, "nurture_resumed", { leadId: lead.id, enrollmentId: en.id });
        out.resumed++;
        continue;
      }
      if (d.kind === "none") continue;
      // Steps not meant for this lead (opt-in vs not) are passed for good.
      const passTo = d.skipped.length ? Math.max(...d.skipped.map((s) => s.position)) + 1 : en.nextPosition;
      if (d.kind === "complete") {
        await db.nurtureEnrollment.updateMany({ where: { id: en.id, tenantId }, data: { status: "completed", nextPosition: passTo } });
        await event(tenantId, "nurture_completed", { leadId: lead.id, enrollmentId: en.id });
        out.completed++;
        continue;
      }
      if (d.kind === "wait") {
        if (passTo !== en.nextPosition) await db.nurtureEnrollment.updateMany({ where: { id: en.id, tenantId }, data: { nextPosition: passTo } });
        continue;
      }
      // d.kind === "send"
      const step = d.step;
      const template = templateByKey.get(step.templateKey) ?? null;
      const block = !enabled ? "nurture_disabled" : templateBlock(template, assets);
      if (block || !template) {
        // With sending on, a step whose template or asset does not exist is passed (W9: "skipped,
        // never sent with a placeholder"), so one missing piece does not stall the sequence
        // (Vanda W9-3). An unapproved or not yet imported template, or sending off, waits:
        // a template that is imported later must still reach the leads (Vanda #165-5).
        const pass = enabled && (block ?? "").startsWith("asset_missing");
        const to = pass ? step.position + 1 : passTo;
        if (to !== en.nextPosition) await db.nurtureEnrollment.updateMany({ where: { id: en.id, tenantId }, data: { nextPosition: to } });
        await skipOnce(tenantId, { leadId: lead.id, enrollmentId: en.id, templateKey: step.templateKey, position: step.position, reason: block ?? "template_missing" });
        out.skipped++;
        continue;
      }
      const unsub = signPayload("unsub", { t: tenantId, e: email.trim().toLowerCase(), l: lead.id });
      const unsubscribeUrl = `${BASE}/api/nurture/unsubscribe?d=${unsub.d}&s=${unsub.s}`;
      const trackUrl = (destination: string) => {
        const c = signPayload("click", { t: tenantId, en: en.id, l: lead.id, k: step.templateKey, p: step.position, u: destination });
        return `${BASE}/api/nurture/click?d=${c.d}&s=${c.s}`;
      };
      const { text, html } = renderBody(template.bodyMd, { templateKey: step.templateKey, position: step.position, trackUrl, unsubscribeUrl, issuer });
      // Claim the step first (Vanda W9-2): a concurrent run, or a crash after the send,
      // can never send the same step twice. Released again if the send fails.
      const claim = await db.nurtureEnrollment.updateMany({
        where: { id: en.id, tenantId, status: "active", nextPosition: en.nextPosition },
        data: { nextPosition: step.position + 1, lastSentAt: now },
      });
      if (claim.count !== 1) continue;
      const r = await sendEmail({
        tenantId, to: email, subject: template.subject, text, html,
        fromName: lead.assignedTo?.name ?? null,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        companyId: lead.companyId, personId: lead.contact?.personId ?? null,
      });
      if (!r.ok) {
        // Resend may have accepted it (timeout, 5xx): keep the claim, a retry could send twice (Vanda #165-2).
        if (!r.uncertain) {
          await db.nurtureEnrollment.updateMany({
            where: { id: en.id, tenantId, nextPosition: step.position + 1 },
            data: { nextPosition: en.nextPosition, lastSentAt: en.lastSentAt },
          });
        }
        await skipOnce(tenantId, { leadId: lead.id, enrollmentId: en.id, templateKey: step.templateKey, position: step.position, reason: r.uncertain ? "send_uncertain" : "send_failed", error: r.error });
        out.skipped++;
        continue;
      }
      await event(tenantId, "nurture_sent", { leadId: lead.id, enrollmentId: en.id, templateKey: step.templateKey, position: step.position, resendId: r.id });
      out.sent++;
    } catch (err) {
      out.errors++;
      reportError("nurture.advance", err, { enrollmentId: en.id });
    }
  }
  return out;
}
