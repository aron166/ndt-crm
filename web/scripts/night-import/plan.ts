// Night import 2026-11-16: the PURE planner. Turns the graded night files into, per draft campaign,
// one members wire row per company (fed to lib/campaigns/service addMembers, the same path as the
// member-load screen) plus "extras": the firm's other contacts, stored as persons and contacts on the
// company and in no campaign. Contact data never enters the repo; the runner reads it from outside.
// Rules: a suppressed address or domain is never planned; an e-mail lands in exactly one campaign
// (input B, the tender contacts, wins); per company the best named person is the member, a role
// mailbox only when the firm has no named person.

import { companyKey, normalizeVat } from "@/lib/import/normalize";
import { normalizeEmail } from "@/lib/email";
import { isSuppressed, type SuppressionSet } from "@/lib/suppression/match";
import { memberRowSchema, type MemberRow } from "@/lib/campaigns/members";

export interface ARow {
  firm_name: string; tax_number?: string | null; city?: string | null; domain?: string | null; our_segment: string; fit: string;
  email?: string | null; email_class: string; person_name_clean?: string | null; person_name?: string | null; person_role?: string | null;
  phone_direct?: string | null; person_relevance?: number | null; source_url?: string | null; quote?: string | null;
  mx_ok?: boolean; off_target?: boolean; free_mail?: boolean;
}
export interface BRow {
  firm_name: string; tax_number?: string | null; city?: string | null; domain?: string | null; segment?: string | null; tier: string;
  person_name?: string | null; person_role?: string | null; email?: string | null; email_class?: string | null; phone_direct?: string | null;
  source_url?: string | null; why_now?: string | null; why_now_url?: string | null; freemail?: boolean;
}
export interface Inputs {
  /** lowercased e-mail -> copy lane rating of the tender opener (openers-fit.csv). */
  fit: ReadonlyMap<string, { fit: string; warm: boolean }>;
  /** lowercased e-mail -> Hungarian opener (openers.csv), PROPOSAL copy. */
  opener: ReadonlyMap<string, string>;
  suppressions: SuppressionSet;
}

export const NIGHT_CAMPAIGNS = [
  "night-contractor", "night-engineer", "night-fm-owner", "night-industry-utility", "night-infrastructure", "night-mep", "night-other", "night-tender",
] as const;
export type NightSlug = (typeof NIGHT_CAMPAIGNS)[number];

const SEGMENT_CAMPAIGN: Record<string, NightSlug> = {
  contractor: "night-contractor", engineer: "night-engineer", fm_owner: "night-fm-owner", industry_utility: "night-industry-utility",
  infrastructure: "night-infrastructure", mep: "night-mep",
};

export type SkipKey = "invalid_email" | "no_mx" | "off_target" | "suppressed" | "duplicate_email"
  | "b_no_email" | "b_tier_c" | "b_fit_low" | "b_warm_account" | "b_unrated";

/** A planned contact: the members wire row plus its group key (company) and rank inside the group. */
export type Planned = MemberRow & { email: string; group: string; rank: number; named: boolean };

export interface NightPlan {
  campaigns: Record<NightSlug, { members: Planned[]; extras: Planned[] }>;
  skipped: Record<SkipKey, number>;
}

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
const validEmail = (e: string) => memberRowSchema.shape.email.safeParse(e).success && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export function planNightImport(aRows: readonly ARow[], bRows: readonly BRow[], inp: Inputs): NightPlan {
  const skipped: Record<SkipKey, number> = {
    invalid_email: 0, no_mx: 0, off_target: 0, suppressed: 0, duplicate_email: 0, b_no_email: 0, b_tier_c: 0, b_fit_low: 0, b_warm_account: 0, b_unrated: 0,
  };
  const placed = new Set<string>();
  const out = Object.fromEntries(NIGHT_CAMPAIGNS.map((s) => [s, [] as Planned[]])) as Record<NightSlug, Planned[]>;

  // Shared gate: valid, not suppressed, not yet placed. Returns the normalized e-mail or null (counted).
  const gate = (raw: string | null | undefined): string | null => {
    const e = raw ? normalizeEmail(raw) : null;
    if (!e || !validEmail(e)) { skipped.invalid_email++; return null; }
    if (isSuppressed(e, inp.suppressions)) { skipped.suppressed++; return null; }
    if (placed.has(e)) { skipped.duplicate_email++; return null; }
    placed.add(e);
    return e;
  };

  // B first: a tender contact wins the e-mail.
  for (const r of bRows) {
    if (r.tier !== "A" && r.tier !== "B") { skipped.b_tier_c++; continue; }
    if (!r.email) { skipped.b_no_email++; continue; }
    const f = inp.fit.get(r.email.trim().toLowerCase());
    if (!f) { skipped.b_unrated++; continue; }
    if (f.warm) { skipped.b_warm_account++; continue; }
    if (f.fit !== "high" && f.fit !== "mid") { skipped.b_fit_low++; continue; }
    const email = gate(r.email);
    if (!email) continue;
    const named = r.email_class === "personal" && Boolean(clip(r.person_name, 120));
    const opener = inp.opener.get(email);
    out["night-tender"].push({
      company_name: clip(r.firm_name, 200) ?? "?", vat: clip(r.tax_number, 20), city: clip(r.city, 100), website: clip(r.domain, 300),
      person_name: named ? clip(r.person_name, 120) : undefined, role: clip(r.person_role, 120), phone: clip(r.phone_direct, 40), email,
      tier: r.tier,
      // Fit first so the list sorts by it; the opener is PROPOSAL copy, not approved.
      why: clip(`[${f.fit}] ${opener ?? r.why_now ?? ""}`, 300),
      segment: clip(r.segment, 60),
      source: clip(`night-2026-11-16 B TED ${r.why_now_url ?? ""}`, 200),
      contact_source: clip(`${named ? "personal" : "role"}${r.freemail ? " freemail" : ""}: ${r.source_url ?? ""}`, 300),
      priority: f.fit === "high" ? 10 : 30,
      group: groupKey(r.firm_name, r.tax_number), rank: (named ? 0 : 10) + (f.fit === "high" ? 0 : 1), named,
    } as Planned);
  }

  for (const r of aRows) {
    if (r.off_target) { skipped.off_target++; continue; }
    if (r.mx_ok === false) { skipped.no_mx++; continue; }
    const email = gate(r.email);
    if (!email) continue;
    const name = clip(r.person_name_clean ?? r.person_name, 120);
    const named = r.email_class === "personal" && Boolean(name);
    const rel = r.person_relevance === 1 ? 0 : r.person_relevance === 2 ? 1 : 2;
    out[SEGMENT_CAMPAIGN[r.our_segment] ?? "night-other"].push({
      company_name: clip(r.firm_name, 200) ?? "?", vat: clip(r.tax_number, 20), city: clip(r.city, 100), website: clip(r.domain, 300),
      person_name: named ? name : undefined, role: clip(r.person_role, 120), phone: clip(r.phone_direct, 40), email,
      tier: clip(r.fit, 2),
      why: clip(`[fit ${r.fit}] ${r.quote ?? ""}`, 300),
      segment: clip(r.our_segment, 60),
      source: "night-2026-11-16 A",
      contact_source: clip(`${named ? "personal" : "role"}${r.free_mail ? " freemail" : ""}: ${r.source_url ?? ""}`, 300),
      priority: (named ? [10, 20, 40][rel] : 70) - (r.fit === "A" ? 5 : 0),
      group: groupKey(r.firm_name, r.tax_number), rank: (named ? 0 : 10) + rel, named,
    } as Planned);
  }

  const campaigns = {} as NightPlan["campaigns"];
  for (const slug of NIGHT_CAMPAIGNS) {
    const groups = new Map<string, Planned[]>();
    for (const p of out[slug]) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
    const members: Planned[] = [];
    const extras: Planned[] = [];
    for (const g of groups.values()) {
      const [best, ...rest] = [...g].sort((x, y) => x.rank - y.rank);
      members.push(best);
      extras.push(...rest);
    }
    campaigns[slug] = { members, extras };
  }
  return { campaigns, skipped };
}

/** VAT when present, else the import name key: the same keys the member load resolves companies by. */
export function groupKey(name: string, vat: string | null | undefined): string {
  const v = normalizeVat(vat ?? null);
  return v ? `vat:${v}` : `name:${companyKey(name)}`;
}

/** The members wire row for addMembers: the planner's helper fields stripped. */
export function wireRow(p: Planned): MemberRow {
  const { group: _g, rank: _r, named: _n, ...row } = p;
  return row;
}
