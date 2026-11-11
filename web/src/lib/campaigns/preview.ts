// Prospect quick view and the e-mail preview (server only). READ ONLY: nothing here creates,
// updates or deletes a row (tested in preview.test.ts). Every query is scoped by tenantId.
// Callers check the CRM user (server actions, the campaign page under the (app) layout).
// Hungarian copy is PROPOSAL until Áron approves it.

import { db } from "@/lib/db";
import { getResendConfig } from "@/lib/integrations/resend";
import { isEmailAddress } from "./members";
import {
  fieldLabel, pickAsset, renderEmail, segmentOf, SEGMENTS, variantTag,
  type MergeValues, type Rendered, type SegmentKey, type StepVariant,
} from "./email-preview";

/** The segment variants of a campaign's e-mail steps, with their pipeline state. */
export async function campaignVariants(tenantId: number, campaignId: number, client: Pick<typeof db, "contentItem"> = db) {
  const rows = await client.contentItem.findMany({ where: { tenantId, campaignId, category: "email", status: { not: "archived" } }, select: { id: true, status: true, sourceMeta: true } });
  return rows.flatMap((r) => {
    const tag = variantTag(r.sourceMeta);
    return tag ? [{ step: tag.step, segment: tag.segment, itemId: r.id, status: r.status }] : [];
  });
}


/** The address a draft would go to: the member's person, then its contacts at the company, then any contact. Same order as draftEmailStep. */
export function memberAddress(m: { companyId: number; personId: number | null; person: { email: string | null } | null }, contacts: readonly { companyId: number; personId: number; email: string | null; person: { email: string | null } | null }[]): string | null {
  if (isEmailAddress(m.person?.email)) return m.person!.email!.trim();
  const own = contacts.filter((k) => k.companyId === m.companyId && (m.personId == null || k.personId === m.personId));
  for (const k of own.length ? own : contacts.filter((x) => x.companyId === m.companyId)) {
    for (const e of [k.email, k.person?.email]) if (isEmailAddress(e)) return e.trim();
  }
  return null;
}

const ROLE_LOCAL = /^(info|iroda|office|titkarsag|titkárság|kapcsolat|contact|hello|ugyfelszolgalat|sales|ertekesites|admin|mail|posta|recepcio)$/i;
/** A shared mailbox (info@, iroda@) rather than a person's own address. */
export const isRoleAddress = (email: string) => ROLE_LOCAL.test(email.split("@")[0] ?? "");

const fullName = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.lastName} ${p.firstName}`.split(/\s+/).filter((x) => x && x !== "-").join(" ") || null : null;

export interface StepEmail {
  position: number;
  itemId: number | null;
  title: string | null;
  status: string | null;
  version: number | null;
  /** Reviewers whose verdict on the shown version is approve. */
  approvedBy: string[];
  /** Which asset this is: the segment's variant or the step's own. */
  via: "variant" | "step" | null;
  rendered: Rendered | null;
}

/** Everything one campaign's e-mail steps need, loaded once for the quick view and the check. */
export async function emailContext(tenantId: number, campaignId: number, senderUserId: number | null) {
  const [steps, tagged, sender, tenant, resend] = await Promise.all([
    db.campaignStep.findMany({ where: { tenantId, campaignId, channel: "email" }, orderBy: { position: "asc" }, select: { position: true, contentItemId: true } }),
    campaignVariants(tenantId, campaignId),
    senderUserId != null ? db.user.findFirst({ where: { tenantId, id: senderUserId }, select: { name: true, settings: true } }) : null,
    db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    getResendConfig(tenantId),
  ]);
  const variants = new Map<number, StepVariant[]>();
  for (const t of tagged) variants.set(t.step, [...(variants.get(t.step) ?? []), { itemId: t.itemId, segment: t.segment, status: t.status }]);
  const ids = [...new Set([...steps.map((s) => s.contentItemId), ...tagged.map((t) => t.itemId)].filter((v): v is number => v != null))];
  const items = ids.length ? await db.contentItem.findMany({
    where: { tenantId, id: { in: ids } },
    select: {
      id: true, title: true, status: true,
      currentVersion: { select: { id: true, number: true, body: true } },
      liveVersion: { select: { id: true, number: true, body: true } },
    },
  }) : [];
  const versionIds = items.map((i) => (i.status === "live" ? i.liveVersion?.id : i.currentVersion?.id)).filter((v): v is number => v != null);
  const reviews = versionIds.length ? await db.contentReview.findMany({
    where: { tenantId, versionId: { in: versionIds }, verdict: "approve" }, select: { versionId: true, reviewer: { select: { name: true } } },
  }) : [];
  const ts = (tenant?.settings ?? {}) as Record<string, unknown>;
  const us = (sender?.settings ?? {}) as Record<string, unknown>;
  return {
    steps: steps.map((s) => ({ ...s, contentStatus: items.find((i) => i.id === s.contentItemId)?.status ?? null })),
    variants, items, reviews,
    sender: {
      name: sender?.name ?? null,
      phone: typeof us.phone === "string" && us.phone.trim() ? us.phone.trim() : null,
      from: resend ? (resend.fromName ? `${resend.fromName} <${resend.fromEmail}>` : resend.fromEmail) : null,
      replyTo: typeof ts.outreachReplyTo === "string" ? ts.outreachReplyTo : null,
      footer: typeof ts.outreachFooter === "string" && ts.outreachFooter.trim() ? ts.outreachFooter.trim() : null,
    },
  };
}
type Ctx = Awaited<ReturnType<typeof emailContext>>;

function stepEmails(ctx: Ctx, segment: SegmentKey | null, values: MergeValues): StepEmail[] {
  return ctx.steps.map((st) => {
    const vars = ctx.variants.get(st.position) ?? [];
    const itemId = pickAsset(st, vars, segment);
    const item = itemId != null ? ctx.items.find((i) => i.id === itemId) : undefined;
    if (!item) return { position: st.position, itemId: null, title: null, status: null, version: null, approvedBy: [], via: null, rendered: null };
    const v = item.status === "live" ? item.liveVersion : item.currentVersion;
    return {
      position: st.position, itemId: item.id, title: item.title, status: item.status, version: v?.number ?? null,
      approvedBy: ctx.reviews.filter((r) => r.versionId === v?.id).map((r) => r.reviewer.name),
      via: vars.some((x) => x.itemId === item.id) ? "variant" : "step",
      rendered: v ? renderEmail({ subject: item.title, body: v.body }, values) : null,
    };
  });
}

const MEMBER_SELECT = {
  id: true, companyId: true, personId: true, state: true, stepPosition: true, tier: true, lane: true, why: true, city: true,
  segment: true, source: true, contactSource: true, importBatch: true, createdPerson: true, createdCompany: true, leadId: true,
  attempts: true, lastOutcome: true, lastTouchedAt: true, nextEligibleOn: true,
  company: { select: { id: true, name: true, city: true, website: true, accountType: true, customerValue: true, inspectionFrequency: true, ndtMethods: true, lastInteractionDate: true } },
  person: { select: { firstName: true, lastName: true, email: true, phone: true } },
} as const;

export function valuesFor(m: { city: string | null; company: { name: string; city: string | null }; person: { firstName: string; lastName: string } | null }, segment: SegmentKey | null, ctx: Ctx): MergeValues {
  return {
    company: m.company.name, contactName: fullName(m.person), city: m.city ?? m.company.city, segment,
    senderName: ctx.sender.name, senderPhone: ctx.sender.phone,
    whyNow: null, // no checked, sourced why_now is stored in the CRM; the builder's reason is internal (English, not for a customer)
    tripDate: null, tripCity: null,
  };
}

/** What is wrong with this member's e-mails, one line each; empty = would go out complete. */
export function emailProblems(address: string | null, emails: readonly StepEmail[], segment: SegmentKey | null): string[] {
  const out: string[] = [];
  if (!address) out.push("nincs e-mail cím");
  for (const e of emails) {
    if (!e.rendered) out.push(segment ? `${e.position}. lépés: nincs anyag ehhez a szegmenshez (${segment})` : `${e.position}. lépés: nincs anyag (a szegmens ismeretlen)`);
    else if (e.rendered.missing.length) out.push(`${e.position}. lépés: kitöltetlen mező: ${e.rendered.missing.map(fieldLabel).join(", ")}`);
    if (e.rendered?.suffix.length) out.push(`${e.position}. lépés: toldalék a mezőn: ${e.rendered.suffix.map(fieldLabel).join(", ")}`);
  }
  return out;
}

export async function memberQuickView(tenantId: number, slug: string, memberId: number) {
  const c = await db.campaign.findFirst({ where: { tenantId, slug }, select: { id: true, slug: true, senderUserId: true, steps: { orderBy: { position: "asc" }, select: { position: true, channel: true } } } });
  if (!c) return null;
  const m = await db.campaignMember.findFirst({ where: { tenantId, campaignId: c.id, id: memberId }, select: MEMBER_SELECT });
  if (!m) return null;
  const [ctx, contacts, leads, deals, otherCampaigns, events, interactions] = await Promise.all([
    emailContext(tenantId, c.id, c.senderUserId),
    db.contact.findMany({ where: { tenantId, companyId: m.companyId, endedAt: null }, select: { companyId: true, personId: true, role: true, email: true, phone: true, person: { select: { firstName: true, lastName: true, email: true, phone: true } } } }),
    db.lead.findMany({ where: { tenantId, companyId: m.companyId }, orderBy: { id: "desc" }, take: 5, select: { id: true, status: true, outcome: true, receivedDate: true } }),
    db.deal.findMany({ where: { tenantId, companyId: m.companyId }, orderBy: { id: "desc" }, take: 5, select: { id: true, title: true, stage: { select: { name: true } } } }),
    db.campaignMember.findMany({ where: { tenantId, companyId: m.companyId, campaignId: { not: c.id } }, select: { state: true, campaign: { select: { slug: true, name: true } } } }),
    db.campaignEvent.findMany({ where: { tenantId, memberId: m.id }, orderBy: { at: "desc" }, take: 10, select: { stepPosition: true, outcome: true, at: true } }),
    db.interaction.aggregate({ where: { tenantId, companyId: m.companyId }, _count: { _all: true }, _max: { occurredAt: true } }),
  ]);
  const segment = segmentOf(m);
  const address = memberAddress(m, contacts);
  const personContact = contacts.find((k) => k.personId === m.personId) ?? null;
  const emails = stepEmails(ctx, segment, valuesFor(m, segment, ctx));
  const phone = m.person?.phone ?? personContact?.phone ?? contacts.find((k) => k.phone || k.person.phone)?.phone ?? null;
  return {
    member: {
      id: m.id, state: m.state, stepPosition: m.stepPosition, stepChannel: c.steps.find((s) => s.position === m.stepPosition)?.channel ?? null,
      stepCount: c.steps.length, tier: m.tier, lane: m.lane, why: m.why, city: m.city ?? m.company.city,
      rawSegment: m.segment, segment, segmentLabel: segment ? SEGMENTS[segment] : null, source: m.source, importBatch: m.importBatch,
      attempts: m.attempts, lastOutcome: m.lastOutcome, lastTouchedAt: m.lastTouchedAt?.toISOString() ?? null,
    },
    company: { id: m.company.id, name: m.company.name, website: m.company.website, createdByLoad: m.createdCompany },
    contact: {
      name: fullName(m.person), role: personContact?.role ?? null, email: address, phone,
      kind: address ? (isRoleAddress(address) ? "role" : "personal") : null,
      // Where the route came from, never a guess: the page the builder found it on, the load file, or the CRM.
      origin: m.contactSource ? { kind: "page" as const, value: m.contactSource }
        : m.createdPerson ? { kind: "load" as const, value: m.importBatch }
        : m.personId != null ? { kind: "crm" as const, value: null }
        : null,
    },
    history: {
      leadId: m.leadId,
      leads: leads.map((l) => ({ id: l.id, status: l.status, outcome: l.outcome, at: l.receivedDate?.toISOString() ?? null })),
      deals: deals.map((d) => ({ id: d.id, title: d.title, stage: d.stage?.name ?? null })),
      campaigns: otherCampaigns.map((x) => ({ slug: x.campaign.slug, name: x.campaign.name, state: x.state })),
      events: events.map((e) => ({ step: e.stepPosition, outcome: e.outcome, at: e.at.toISOString() })),
      interactions: interactions._count._all, lastInteraction: interactions._max.occurredAt?.toISOString() ?? m.company.lastInteractionDate?.toISOString() ?? null,
      controlLabor: {
        accountType: m.company.accountType, customerValue: m.company.customerValue != null ? Number(m.company.customerValue) : null,
        frequency: m.company.inspectionFrequency, methods: m.company.ndtMethods,
      },
    },
    emails,
    problems: emailProblems(address, emails, segment),
    sender: ctx.sender,
  };
}
export type QuickView = NonNullable<Awaited<ReturnType<typeof memberQuickView>>>;

/** Launch-tab check: of the open members, how many would get a complete e-mail, and what is wrong with the rest. */
export async function campaignEmailCheck(tenantId: number, campaignId: number, senderUserId: number | null) {
  const [ctx, members] = await Promise.all([
    emailContext(tenantId, campaignId, senderUserId),
    db.campaignMember.findMany({
      where: { tenantId, campaignId, state: { in: ["queued", "needs_contact", "needs_email"] } },
      orderBy: [{ priority: "asc" }, { id: "asc" }], select: MEMBER_SELECT,
    }),
  ]);
  const contacts = members.length ? await db.contact.findMany({
    where: { tenantId, endedAt: null, companyId: { in: members.map((m) => m.companyId) } },
    select: { companyId: true, personId: true, email: true, person: { select: { email: true } } },
  }) : [];
  let complete = 0, unresolved = 0, noAddress = 0, noAsset = 0;
  const rows: { memberId: number; company: string; segment: SegmentKey | null; problems: string[] }[] = [];
  for (const m of members) {
    const segment = segmentOf(m);
    const emails = stepEmails(ctx, segment, valuesFor(m, segment, ctx));
    const address = memberAddress(m, contacts);
    const problems = emailProblems(address, emails, segment);
    if (!address) noAddress++;
    if (emails.some((e) => !e.rendered)) noAsset++;
    if (emails.some((e) => e.rendered && (e.rendered.missing.length || e.rendered.suffix.length))) unresolved++;
    if (problems.length === 0) complete++;
    else rows.push({ memberId: m.id, company: m.company.name, segment, problems });
  }
  const notLive = [...new Set([...ctx.steps.map((s) => s.contentItemId), ...[...ctx.variants.values()].flat().map((v) => v.itemId)])]
    .filter((id): id is number => id != null).filter((id) => ctx.items.find((i) => i.id === id)?.status !== "live").length;
  return { total: members.length, complete, unresolved, noAddress, noAsset, notLive, emailSteps: ctx.steps.length, sender: ctx.sender, rows };
}
export type EmailCheck = Awaited<ReturnType<typeof campaignEmailCheck>>;
