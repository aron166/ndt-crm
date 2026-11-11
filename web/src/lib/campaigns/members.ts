// Adding members to a campaign: the wire schema and the PURE dedupe planner. The DB side
// (loading the index, writing the plan) is lib/campaigns/service.ts addMembers.
//
// Dedupe order (v1 section c): the builder's crm_company_id, then VAT, then the import
// name key (lib/import/normalize companyKey). A company with an open lead is not a
// prospect (skipped "open_lead"); a suppressed address or domain is skipped; a company
// already in the campaign is skipped, unless it was needs_contact or needs_email and the row
// now brings what was missing (then its state is refreshed). Existing companies are never edited.

import { z } from "zod";
import { companyKey, normalizeVat } from "@/lib/import/normalize";
import { isSuppressed, type SuppressionSet } from "@/lib/suppression/match";
import { normalizeEmail } from "@/lib/email";
import { startFor, type StepDef } from "./rules";

const str = (max: number) => z.string().trim().min(1).max(max);
const optStr = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

export const memberRowSchema = z.object({
  crm_company_id: z.number().int().positive().optional(),
  company_name: str(200),
  vat: optStr(20),
  city: optStr(100),
  website: optStr(300),
  person_name: optStr(120),
  role: optStr(120),
  phone: optStr(40),
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().email().max(200).optional()),
  tier: optStr(2),
  lane: optStr(40),
  why: optStr(300),
  /** Provenance from the launch-list row (quick view): raw segment, list sources, where the contact was found. */
  segment: optStr(60),
  source: optStr(200),
  contact_source: optStr(300),
  priority: z.number().int().min(0).max(1000).optional(),
});
export type MemberRow = z.infer<typeof memberRowSchema>;

export const MEMBERS_MAX_PER_CALL = 1000;

/** user@domain.tld, nothing else: "nincs", "-" or a bare name in an e-mail column is no e-mail (item 6). */
export const isEmailAddress = (v: string | null | undefined): v is string => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/** Existing contact reach per company. A suppressed (unsubscribed or bounced) address is no e-mail (Vanda #188 r2-1). */
export function reachFromContacts(
  contacts: readonly { companyId: number; personId: number; email: string | null; phone: string | null; person: { email: string | null; phone: string | null } }[],
  suppressions: SuppressionSet,
): Map<number, { phone: boolean; email: boolean; personId: number | null }> {
  const out = new Map<number, { phone: boolean; email: boolean; personId: number | null }>();
  for (const k of contacts) {
    const prev = out.get(k.companyId) ?? { phone: false, email: false, personId: null };
    out.set(k.companyId, {
      phone: prev.phone || Boolean(k.phone || k.person.phone),
      email: prev.email || [k.email, k.person.email].some((e) => isEmailAddress(e) && !isSuppressed(e, suppressions)),
      personId: prev.personId ?? k.personId,
    });
  }
  return out;
}
export const addMembersSchema = z.object({
  dry_run: z.boolean().default(true),
  /** One batch id per load; the undo key. Letters, digits, dash, underscore. */
  batch: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  rows: z.array(memberRowSchema).min(1).max(MEMBERS_MAX_PER_CALL),
});

export interface MemberIndex {
  aliveCompanyIds: ReadonlySet<number>;
  byVat: ReadonlyMap<string, number>;
  byName: ReadonlyMap<string, number>;
  openLeadCompanyIds: ReadonlySet<number>;
  /** company id -> member state, for members already in THIS campaign. */
  members: ReadonlyMap<number, string>;
  suppressions: SuppressionSet;
  /** normalized e-mail -> person id. */
  personByEmail: ReadonlyMap<string, number>;
  /** Existing contact reach per company (any active contact with a phone / an e-mail). */
  companyReach: ReadonlyMap<number, { phone: boolean; email: boolean; personId: number | null }>;
}

export type SkipReason = "open_lead" | "suppressed" | "already_member" | "duplicate_in_payload" | "unknown_company_id";

export type RowPlan =
  | { row: number; action: "skip"; reason: SkipReason; companyId: number | null; name: string }
  | {
      row: number;
      action: "add" | "refresh";
      name: string;
      /** null = create the company from the row. */
      companyId: number | null;
      /** number = existing person, "create" = new person from the row, null = none. */
      person: number | "create" | null;
      state: "queued" | "needs_contact" | "needs_email";
      stepPosition: number;
    };

export interface MembersPlan {
  rows: RowPlan[];
  summary: {
    total: number; add: number; refresh: number; skip: number;
    matchedCompanies: number; newCompanies: number; newPersons: number; needsContact: number; needsEmail: number;
    skipped: Record<SkipReason, number>;
  };
}

export function planMembers(rows: readonly MemberRow[], idx: MemberIndex, steps: readonly StepDef[]): MembersPlan {
  const seen = new Set<string>(); // resolved company id, or "new:<name key>"
  const out: RowPlan[] = [];
  rows.forEach((r, i) => {
    const row = i + 1;
    const name = r.company_name;
    let companyId: number | null = null;
    if (r.crm_company_id != null) {
      if (!idx.aliveCompanyIds.has(r.crm_company_id)) {
        out.push({ row, action: "skip", reason: "unknown_company_id", companyId: r.crm_company_id, name });
        return;
      }
      companyId = r.crm_company_id;
    } else {
      const vat = normalizeVat(r.vat ?? null);
      const nameKey = companyKey(name);
      companyId = (vat ? idx.byVat.get(vat) : undefined) ?? (nameKey ? idx.byName.get(nameKey) : undefined) ?? null;
    }
    const key = companyId != null ? `id:${companyId}` : `new:${companyKey(name)}`;
    if (seen.has(key)) {
      out.push({ row, action: "skip", reason: "duplicate_in_payload", companyId, name });
      return;
    }
    seen.add(key);
    if (companyId != null && idx.openLeadCompanyIds.has(companyId)) {
      out.push({ row, action: "skip", reason: "open_lead", companyId, name });
      return;
    }
    const email = r.email ? normalizeEmail(r.email) : null;
    if (email && isSuppressed(email, idx.suppressions)) {
      out.push({ row, action: "skip", reason: "suppressed", companyId, name });
      return;
    }
    const reach = companyId != null ? idx.companyReach.get(companyId) : undefined;
    const hasEmail = Boolean(email) || Boolean(reach?.email);
    const hasPhone = Boolean(r.phone) || Boolean(reach?.phone);
    const start = startFor(steps, { hasEmail, hasPhone });
    const person: number | "create" | null =
      (email ? idx.personByEmail.get(email) : undefined) ??
      // A matched company keeps its existing contact person; never a second copy of them (Vanda #188-7).
      reach?.personId ??
      (r.person_name || email || r.phone ? "create" : null);

    const existing = companyId != null ? idx.members.get(companyId) : undefined;
    if (existing !== undefined) {
      if ((existing === "needs_contact" || existing === "needs_email") && start.state === "queued") {
        out.push({ row, action: "refresh", name, companyId, person, ...start });
      } else {
        out.push({ row, action: "skip", reason: "already_member", companyId, name });
      }
      return;
    }
    out.push({ row, action: "add", name, companyId, person, ...start });
  });

  const skipped: Record<SkipReason, number> = { open_lead: 0, suppressed: 0, already_member: 0, duplicate_in_payload: 0, unknown_company_id: 0 };
  let add = 0, refresh = 0, matched = 0, created = 0, persons = 0, needs = 0, noEmail = 0;
  for (const p of out) {
    if (p.action === "skip") { skipped[p.reason]++; continue; }
    if (p.action === "add") add++; else refresh++;
    if (p.companyId != null) matched++; else created++;
    if (p.person === "create") persons++;
    if (p.state === "needs_contact") needs++;
    if (p.state === "needs_email") noEmail++;
  }
  return {
    rows: out,
    summary: {
      total: rows.length, add, refresh, skip: out.length - add - refresh,
      matchedCompanies: matched, newCompanies: created, newPersons: persons, needsContact: needs, needsEmail: noEmail, skipped,
    },
  };
}
