// W9 nurture, PURE rules (no DB). Spec: workspace docs/birdsview/gtm-system-2026-11-08/
// W9-funnel-spec.md + CONTENT-PLAN.md sections 2 and 4. The DB side is lib/nurture/engine.ts.
//
// Hard gates, all must hold before anything is sent:
//   1. tenants.settings.nurture_enabled === true (default off)
//   2. the template is approved by Áron (approved_by_aron + status approved)
//   3. the template's asset exists (W9 section 4: "skipped, never sent with a placeholder")
//   4. the address is not on the shared suppression list (checked in sendEmail too)

export const SEGMENTS = ["service", "device", "info", "lost"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const PAUSE_QUIET_DAYS = 14; // resume only after 14 quiet days (W9 section 2)
export const MIN_DAYS_BETWEEN_SENDS = 6; // frequency cap (CONTENT-PLAN section 4.3)
export const NO_SEND_HOURS_AFTER_CALL = 48; // never right after a human call (CONTENT-PLAN section 2)
const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface NurtureLead {
  intent: string | null;
  status: string | null;
  outcome: string;
  convertedDealId: number | null;
  qualification: Record<string, unknown> | null;
  customFields: Record<string, unknown> | null;
}

/** Newsletter consent = the unticked opt-in on the form (TASKS 2026-11-09). Only an explicit yes counts. */
export function hasNewsletterOptIn(lead: Pick<NurtureLead, "qualification">): boolean {
  const v = lead.qualification?.newsletter_opt_in;
  return v === true || (typeof v === "string" && ["yes", "true", "on", "1", "igen"].includes(v.trim().toLowerCase()));
}

/**
 * Which segment a lead belongs to, or null (no nurture). Closed-won / ordered /
 * converted leads never get nurture. A lost lead only with a reason to keep in touch:
 * the info-list flag (lead 21) or the newsletter opt-in.
 */
export function segmentFor(lead: NurtureLead): Segment | null {
  if (lead.convertedDealId != null || lead.outcome === "won") return null;
  if (lead.status === "won" || lead.status === "ordered") return null;
  if (lead.outcome === "lost" || lead.status === "lost" || lead.status === "recall") {
    const listed = typeof lead.customFields?.nurture_list === "string" && lead.customFields.nurture_list !== "";
    return listed || hasNewsletterOptIn(lead) ? "lost" : null;
  }
  switch (lead.intent) {
    case "service_concrete": return "service";
    case "rental": case "purchase": return "device";
    case "service_vague": return "info";
    default: return null; // unknown / device-undecided: a human sorts it on the call first
  }
}

export interface Step { position: number; delayDays: number; templateKey: string; audience: "all" | "opt_in" | "non_opt_in" }

export function audienceMatches(audience: Step["audience"], optIn: boolean): boolean {
  return audience === "all" || (audience === "opt_in" ? optIn : !optIn);
}

export interface EnrollmentState {
  status: "active" | "paused" | "stopped" | "completed";
  nextPosition: number;
  enrolledAt: Date;
  pausedAt: Date | null;
  resumedAt: Date | null;
  lastSentAt: Date | null;
}

/** Activity that means "a human is talking to this lead": pause the sequence. */
export interface Activity { at: Date; kind: "reply" | "call" | "booking" | "stage_change" }

export type Decision =
  | { kind: "pause"; reason: Activity["kind"] }
  | { kind: "resume" }
  | { kind: "send"; step: Step; skipped: Step[] }
  | { kind: "wait"; reason: string; skipped: Step[] }
  | { kind: "complete"; skipped: Step[] }
  | { kind: "none" };

/**
 * One enrollment, one decision for this run. Pure.
 * - active + activity since enrolment/resume -> pause
 * - paused + 14 quiet days -> resume
 * - active: the next step whose audience matches (non-matching steps are skipped),
 *   due by delay from enrolment, honouring the frequency cap and the 48 h after a call.
 */
export function decide(
  e: EnrollmentState, steps: readonly Step[], activities: readonly Activity[], optIn: boolean, now: Date,
): Decision {
  if (e.status === "stopped" || e.status === "completed") return { kind: "none" };
  const anchor = e.resumedAt ?? e.enrolledAt;
  const latest = activities.reduce<Activity | null>((m, a) => (!m || a.at > m.at ? a : m), null);
  if (e.status === "paused") {
    const quietSince = latest ? latest.at : e.pausedAt ?? anchor;
    return now.getTime() - quietSince.getTime() >= PAUSE_QUIET_DAYS * DAY ? { kind: "resume" } : { kind: "none" };
  }
  const recent = activities.filter((a) => a.at > anchor);
  if (recent.length) {
    const last = recent.reduce((m, a) => (a.at > m.at ? a : m));
    return { kind: "pause", reason: last.kind };
  }
  const ordered = [...steps].sort((a, b) => a.position - b.position).filter((s) => s.position >= e.nextPosition);
  const skipped: Step[] = [];
  for (const s of ordered) {
    if (!audienceMatches(s.audience, optIn)) { skipped.push(s); continue; }
    const due = e.enrolledAt.getTime() + s.delayDays * DAY;
    if (now.getTime() < due) return { kind: "wait", reason: "not_due", skipped };
    if (e.lastSentAt && now.getTime() - e.lastSentAt.getTime() < MIN_DAYS_BETWEEN_SENDS * DAY) {
      return { kind: "wait", reason: "frequency_cap", skipped };
    }
    const lastCall = activities.filter((a) => a.kind === "call").reduce<Date | null>((m, a) => (!m || a.at > m ? a.at : m), null);
    if (lastCall && now.getTime() - lastCall.getTime() < NO_SEND_HOURS_AFTER_CALL * HOUR) {
      return { kind: "wait", reason: "recent_call", skipped };
    }
    return { kind: "send", step: s, skipped };
  }
  return { kind: "complete", skipped };
}

export interface TemplateGate { status: string; approvedByAron: boolean; requiresAsset: string | null }

/** Why a template may not be sent, or null when it may. `assets` = asset keys that exist (tenant config). */
export function templateBlock(t: TemplateGate | null, assets: readonly string[]): string | null {
  if (!t) return "template_missing";
  if (!t.approvedByAron || t.status !== "approved") return "not_approved";
  if (t.requiresAsset && !assets.includes(t.requiresAsset)) return `asset_missing:${t.requiresAsset}`;
  return null;
}
