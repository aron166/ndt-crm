import type { Prisma } from "@prisma/client";
import type { LeadIntake } from "./schema";
import { normalizeIntakeAnswers } from "./qualification";
import { computeTier, type LeadTier } from "./tier";

// Transaction-agnostic lead ingestion (Platform Foundation #4).
//
// All writes go through the `tx` client passed in, so the caller controls the
// transaction boundary and this function stays unit-testable with a mock.
// Honours the non-negotiables: tenant scoping on every query, Person is the
// permanent entity (deduped by email), Contact is the time-bounded link,
// audit_log + app_events are append-only.

// The narrow slice of the Prisma client this needs. The real Prisma
// TransactionClient satisfies it structurally; tests pass a mock.
export interface LeadTx {
  company: {
    findFirst(args: Prisma.CompanyFindFirstArgs): Promise<{ id: number } | null>;
    create(args: Prisma.CompanyCreateArgs): Promise<{ id: number }>;
  };
  person: {
    findFirst(args: Prisma.PersonFindFirstArgs): Promise<{ id: number } | null>;
    create(args: Prisma.PersonCreateArgs): Promise<{ id: number }>;
  };
  contact: {
    findFirst(args: Prisma.ContactFindFirstArgs): Promise<{ id: number } | null>;
    create(args: Prisma.ContactCreateArgs): Promise<{ id: number }>;
  };
  lead: {
    create(args: Prisma.LeadCreateArgs): Promise<{ id: number }>;
    findFirst(args: Prisma.LeadFindFirstArgs): Promise<{ id: number; companyId: number | null; contactId: number | null } | null>;
  };
  emailDraft: {
    findFirst(args: Prisma.EmailDraftFindFirstArgs): Promise<{ id: number; companyId: number; campaign: string } | null>;
    updateMany(args: Prisma.EmailDraftUpdateManyArgs): Promise<{ count: number }>;
  };
  leadStatus: {
    findFirst(args: Prisma.LeadStatusFindFirstArgs): Promise<{ key: string } | null>;
  };
  auditLog: {
    create(args: Prisma.AuditLogCreateArgs): Promise<{ id: number }>;
  };
  appEvent: {
    create(args: Prisma.AppEventCreateArgs): Promise<{ id: number }>;
  };
}

export interface IngestCtx {
  tenantId: number;
  /** App slug from the authenticated key — the canonical source app. */
  appSlug: string;
}

export interface IngestResult {
  leadId: number;
  /** Always set. See `deduped`. */
  /**
   * True when `thread_key` matched a lead that already existed, so nothing was
   * created and `leadId` is the original. The reply-intake skill runs on a
   * schedule and re-reads the same Gmail thread; this is the signal that it
   * correctly did nothing the second time.
   */
  deduped: boolean;
  /** The draft this reply answered, when `thread_key` matched one. */
  draftId: number | null;
  /** Derived qualification tier, null when no answers were submitted. */
  tier: LeadTier | null;
  companyId: number | null;
  personId: number | null;
  /** True when an existing company was reused (deduped). */
  companyReused: boolean;
  /** True when an existing person was reused (deduped by email). */
  personReused: boolean;
}

function splitName(name: string | undefined, emailFallback?: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: "—" };
    // Hungarian convention elsewhere stores lastName first, but inbound web
    // forms are "First Last". Keep it simple and reversible: first token =
    // first name, remainder = last name.
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }
  const local = emailFallback?.split("@")[0];
  return { firstName: local || "Lead", lastName: "—" };
}

export async function ingestLead(
  input: LeadIntake,
  ctx: IngestCtx,
  tx: LeadTx,
): Promise<IngestResult> {
  const { tenantId } = ctx;
  // sourceApp is authoritative from the authenticated key — the payload's
  // source_app is deliberately ignored, so a key issued to app X can never
  // attribute a lead to app Y. (input.source_app is still preserved verbatim
  // inside the app_events payload below for raw-submission traceability.)
  const sourceApp = ctx.appSlug.trim();

  // 0. Reply intake (addendum item 3). A `thread_key` means "this is an answer
  // to a cold email we sent", and it does two things no other intake does:
  //
  //   (a) IDEMPOTENCY. The reply-intake skill is schedulable and will see the
  //       same Gmail thread on its next run. If a lead already carries this
  //       thread key we return it untouched — no second lead, no second
  //       company, no second automation firing. (The unique index on
  //       (tenant_id, thread_key) is the real guarantee; this is the fast path.)
  //   (b) COMPANY IDENTITY. We already know exactly who we mailed, so the lead
  //       is attached to the DRAFT's company rather than dedupe-by-name on
  //       whatever the replier typed in their signature. Name dedupe is the
  //       weakest link in this intake (STATUS.md: every "(magánérdeklődő)"
  //       collapses onto one row); a thread key sidesteps it entirely.
  // `thread_key` is caller-supplied on a CORS-open, app-key endpoint, and real
  // draft keys are `campaign-slug:companyId` — enumerable. Left untrusted, any
  // key in the tenant could claim a thread: the forged lead owns it, so the
  // genuine reply later comes back `deduped: true`, writes nothing, and alerts
  // nobody. So a thread key is honoured ONLY on the cold-email channel and ONLY
  // when `draft_key` resolves to a real draft of ours — the draft is what
  // vouches for the claim. Anything else falls through to the ordinary intake
  // path with no key stored. (Vanda, #89.)
  const claimedThreadKey = input.thread_key?.trim() || null;
  const draftKey = input.draft_key?.trim() || null;
  const isColdEmailReply = input.channel === "cold_email";

  if (claimedThreadKey && isColdEmailReply) {
    const existingLead = await tx.lead.findFirst({
      where: { tenantId, threadKey: claimedThreadKey },
      select: { id: true, companyId: true },
    });
    if (existingLead) {
      return {
        leadId: existingLead.id,
        deduped: true,
        draftId: null,
        tier: null,
        companyId: existingLead.companyId,
        personId: null,
        companyReused: true,
        personReused: true,
      };
    }
  }

  // The draft is found by the DRAFT key, never by the conversation key.
  // Newest sent touch first: once touches 1 and 2 are both out they share one
  // draft key, and an unordered findFirst reported whichever row Postgres
  // happened to return as "the draft this reply answered". (Vanda, #89.)
  const draft = draftKey && isColdEmailReply
    ? await tx.emailDraft.findFirst({
        where: { tenantId, threadKey: draftKey },
        orderBy: [{ sentAt: "desc" }, { step: "desc" }],
        select: { id: true, companyId: true, campaign: true },
      })
    : null;

  // The key is only stored once a draft has vouched for it.
  const threadKey = draft ? claimedThreadKey : null;

  // 1. Dedupe Company by exact name (case-insensitive) within the tenant —
  // unless the thread key already told us the company for certain.
  const existingCompany = draft
    ? { id: draft.companyId }
    : await tx.company.findFirst({
        where: { tenantId, name: { equals: input.company_name, mode: "insensitive" } },
        select: { id: true },
      });
  const companyReused = Boolean(existingCompany);
  const company =
    existingCompany ??
    (await tx.company.create({
      data: {
        tenantId,
        name: input.company_name,
        accountType: "Lead",
      },
      select: { id: true },
    }));

  // 2. Dedupe Person by email within the tenant (Person is the permanent entity).
  let person: { id: number } | null = null;
  if (input.contact_email) {
    person = await tx.person.findFirst({
      where: { tenantId, email: { equals: input.contact_email, mode: "insensitive" } },
      select: { id: true },
    });
  }
  const personReused = Boolean(person);
  if (!person) {
    const { firstName, lastName } = splitName(input.contact_name, input.contact_email);
    person = await tx.person.create({
      data: {
        tenantId,
        firstName,
        lastName,
        email: input.contact_email ?? null,
        phone: input.contact_phone ?? null,
      },
      select: { id: true },
    });
  }

  // 3. Ensure a current Contact linking person ↔ company (time-bounded state).
  let contact = await tx.contact.findFirst({
    where: { tenantId, personId: person.id, companyId: company.id, endedAt: null },
    select: { id: true },
  });
  if (!contact) {
    contact = await tx.contact.create({
      data: {
        tenantId,
        personId: person.id,
        companyId: company.id,
        email: input.contact_email ?? null,
        phone: input.contact_phone ?? null,
        startedAt: new Date(),
      },
      select: { id: true },
    });
  }

  // 4. Create the Lead at the tenant's INITIAL status (the configurable entry
  //    column of the lead pipeline; falls back to "new"). Marketing passthrough
  //    + contact snapshot live on custom_fields, mirroring the deals pattern.
  const initialStatus = await tx.leadStatus.findFirst({
    where: { tenantId, isInitial: true },
    orderBy: { position: "asc" },
  });
  const statusKey = initialStatus?.key ?? "new";

  const customFields: Record<string, unknown> = {};
  const passthrough: (keyof LeadIntake)[] = [
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "referrer", "landing_variant", "lead_score", "priority",
  ];
  for (const k of passthrough) {
    if (input[k] !== undefined && input[k] !== null) customFields[k] = input[k];
  }
  // Preserve the raw submitted contact details even after they're normalised
  // onto Person/Contact.
  if (input.contact_name) customFields.contact_name = input.contact_name;
  if (input.contact_email) customFields.contact_email = input.contact_email;
  if (input.contact_phone) customFields.contact_phone = input.contact_phone;
  // Qualification answers (locked model) + the tier they derive. `tier` is a
  // real column so the board can filter and count on it; the answers stay JSON.
  const answers = normalizeIntakeAnswers(input.qualification);
  const hasAnswers = Object.keys(answers).length > 0;
  // A derived tier wins whenever the answers actually place the lead; the
  // caller's pre-tier (cold-outreach leads, tiered by research before any
  // answers exist) is the fallback. A setter filling answers later takes over,
  // but answers that derive to null — "not placeable yet" — do not erase what
  // the research already knew.
  const tier = (hasAnswers ? computeTier(answers) : null) ?? input.tier ?? null;

  const lead = await tx.lead.create({
    data: {
      tenantId,
      companyId: company.id,
      contactId: contact.id,
      source: input.source,
      sourceApp,
      channel: input.channel,
      campaign: input.campaign ?? null,
      threadKey,
      status: statusKey,
      subject: input.service_interest ?? null,
      message: input.message ?? null,
      serviceInterest: input.service_interest ?? null,
      receivedDate: new Date(),
      ...(hasAnswers ? { qualification: answers as Prisma.InputJsonValue } : {}),
      ...(tier ? { tier } : {}),
      ...(Object.keys(customFields).length > 0
        ? { customFields: customFields as Prisma.InputJsonValue }
        : {}),
    },
    select: { id: true },
  });

  // 5. Audit (append-only). Attributed to the source app, no user.
  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: null,
      action: "create",
      entityType: "lead",
      entityId: lead.id,
      changes: {
        before: null,
        after: {
          companyId: company.id,
          personId: person.id,
          contactId: contact.id,
          source: input.source,
          sourceApp,
          channel: input.channel,
          status: statusKey,
        },
      } as Prisma.InputJsonValue,
    },
  });

  // 5b. The answered draft is now `replied`. Scoped to the tenant AND to the
  // statuses a reply can legitimately arrive on — only a draft we actually SENT
  // can be replied to, so a never-sent row cannot be flipped by a forged
  // thread key, and an already-`replied` row is not rewritten on a later reply
  // in the same thread.
  // Scoped to the ONE draft row we resolved, by id — not to every draft sharing
  // this key. `threadKeyFor()` slugifies the campaign name, so "Q1 2026" and
  // "Q1-2026" produce the same key for one company; an updateMany on the key
  // would mark both campaigns' emails replied off a single answer.
  // (Vanda, #89.)
  if (draft) {
    await tx.emailDraft.updateMany({
      where: { id: draft.id, tenantId, status: "sent" },
      data: { status: "replied" },
    });

    // A reply must STOP the sequence. Marking the answered draft `replied` did
    // nothing to touches 2-4: they sit at `draft`/`approved` with no thread key,
    // so they survived the flip and `canSend("approved")` is still true — a
    // human would open /outreach and send cold touch 3 to someone who had
    // already answered. They are cancelled here, scoped to this company and
    // campaign. Note this deliberately does NOT widen the `replied` filter
    // above: only a SENT draft can be replied to, and loosening that is the
    // hole that lets a forged key promote an email that never went out.
    // (Vanda, #89.)
    await tx.emailDraft.updateMany({
      where: {
        tenantId,
        companyId: draft.companyId,
        campaign: draft.campaign,
        status: { in: ["draft", "approved"] },
      },
      data: { status: "cancelled" },
    });
  }

  // 6. Emit an app_events row so the ecosystem hub sees the submission.
  await tx.appEvent.create({
    data: {
      tenantId,
      sourceApp,
      eventType: "lead.submitted",
      payload: input as unknown as Prisma.InputJsonValue,
      companyId: company.id,
      personId: person.id,
    },
  });

  // NB: the new-lead follow-up task is no longer created here. It is now driven
  // by the task-automation rule engine (a seeded "lead_created → create_task"
  // rule), fired by the caller via runAutomations() AFTER this transaction
  // commits — so an automation failure can never roll back the lead intake.

  return {
    leadId: lead.id,
    deduped: false,
    draftId: draft?.id ?? null,
    tier,
    companyId: company.id,
    personId: person.id,
    companyReused,
    personReused,
  };
}
