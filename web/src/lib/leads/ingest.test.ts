import { describe, it, expect, vi } from "vitest";
import { ingestLead, type LeadTx } from "./ingest";
import { leadIntakeSchema, type LeadIntake } from "./schema";

// A row matches a Prisma `where` if every clause the fake models (scalar
// equality or `{ equals }`) agrees with the row. A clause on a field the seed
// doesn't carry is ignored rather than failing the match — but that means a
// clause that DOES matter (tenantId, threadKey, ...) must be seeded, or the
// fake can't tell a dropped tenant scope from an unmodeled one. (PR #89.)
function matches(row: Record<string, unknown> | null | undefined, where: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in (v as Record<string, unknown>)) {
      return !(k in row) || (v as { in: unknown[] }).in.includes(row[k]);
    }
    const want = v && typeof v === "object" && "equals" in (v as Record<string, unknown>)
      ? (v as { equals: unknown }).equals
      : v;
    return !(k in row) || row[k] === want;
  });
}

// A tiny in-memory fake of the Prisma transaction client. Each model filters
// its seeded row against the `where` it's called with (see `matches`), so
// tests can assert on the actual query the code sent — including tenant
// scoping — instead of the fake handing back the seed unconditionally.
function makeTx(seed: {
  company?: ({ id: number } & Record<string, unknown>) | null;
  person?: ({ id: number } & Record<string, unknown>) | null;
  contact?: ({ id: number } & Record<string, unknown>) | null;
  /** An existing lead on this thread key — the idempotency fixture. */
  lead?: ({ id: number; companyId: number | null; contactId: number | null } & Record<string, unknown>) | null;
  /** A sent draft this reply answers. */
  draft?: ({ id: number; companyId: number; campaign: string } & Record<string, unknown>) | null;
}) {
  let nextId = 100;
  const created = {
    company: 0, person: 0, contact: 0, lead: 0, auditLog: 0, appEvent: 0,
  };
  const draftUpdates: unknown[] = [];
  const lastLeadData: { value?: unknown } = {};

  const tx: LeadTx = {
    company: {
      findFirst: vi.fn(async (args) => (matches(seed.company, args.where) ? seed.company! : null)),
      create: vi.fn(async () => { created.company++; return { id: ++nextId }; }),
    },
    person: {
      findFirst: vi.fn(async (args) => (matches(seed.person, args.where) ? seed.person! : null)),
      create: vi.fn(async () => { created.person++; return { id: ++nextId }; }),
    },
    contact: {
      findFirst: vi.fn(async (args) => (matches(seed.contact, args.where) ? seed.contact! : null)),
      create: vi.fn(async () => { created.contact++; return { id: ++nextId }; }),
    },
    lead: {
      create: vi.fn(async (args) => { created.lead++; lastLeadData.value = args.data; return { id: ++nextId }; }),
      findFirst: vi.fn(async (args) => (matches(seed.lead, args.where) ? seed.lead! : null)),
    },
    emailDraft: {
      findFirst: vi.fn(async (args) => (matches(seed.draft, args.where) ? seed.draft! : null)),
      updateMany: vi.fn(async (args) => { draftUpdates.push(args); return { count: 1 }; }),
    },
    leadStatus: {
      // No configured initial status in the fake → ingest falls back to "new".
      findFirst: vi.fn(async () => null),
    },
    auditLog: {
      create: vi.fn(async () => { created.auditLog++; return { id: ++nextId }; }),
    },
    appEvent: {
      create: vi.fn(async () => { created.appEvent++; return { id: ++nextId }; }),
    },
  };
  return { tx, created, lastLeadData, draftUpdates };
}

const ctx = { tenantId: 1, appSlug: "betonscan_landing" };

function parse(raw: Record<string, unknown>): LeadIntake {
  const r = leadIntakeSchema.safeParse(raw);
  if (!r.success) throw new Error("fixture failed validation: " + JSON.stringify(r.error.flatten()));
  return r.data;
}

describe("ingestLead", () => {
  it("creates company + person + contact + lead on a fresh submission", async () => {
    const input = parse({
      company_name: "Acme Kft.",
      contact_name: "John Doe",
      contact_email: "john@acme.hu",
      contact_phone: "+36301234567",
      message: "Érdekelne a betonvizsgálat",
      service_interest: "Betonszkennelés",
      utm_source: "google",
      lead_score: "42",
    });

    const { tx, created } = makeTx({});
    const result = await ingestLead(input, ctx, tx);

    expect(created).toEqual({ company: 1, person: 1, contact: 1, lead: 1, auditLog: 1, appEvent: 1 });
    expect(result.companyReused).toBe(false);
    expect(result.personReused).toBe(false);
    expect(result.leadId).toBeTypeOf("number");
    // The follow-up task is no longer created inside ingest — it's now driven by
    // the automation engine (seeded lead_created rule) post-commit. See engine.test.ts.

    // Lead gets status "new", the resolved sourceApp, and marketing passthrough.
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.status).toBe("new");
    expect(data.sourceApp).toBe("betonscan_landing");
    expect(data.customFields).toMatchObject({ utm_source: "google", lead_score: 42 });
  });

  it("dedupes an existing company (by name) and person (by email)", async () => {
    const input = parse({
      company_name: "Acme Kft.",
      contact_email: "john@acme.hu",
    });

    // Both already exist; the contact link does not yet.
    const { tx, created } = makeTx({ company: { id: 7 }, person: { id: 9 } });
    const result = await ingestLead(input, ctx, tx);

    expect(created.company).toBe(0); // reused, not created
    expect(created.person).toBe(0);  // reused, not created
    expect(created.contact).toBe(1); // link created
    expect(created.lead).toBe(1);    // a new lead is always created
    expect(result.companyId).toBe(7);
    expect(result.personId).toBe(9);
    expect(result.companyReused).toBe(true);
    expect(result.personReused).toBe(true);
  });

  it("reuses an existing current contact link without creating a duplicate", async () => {
    const input = parse({
      company_name: "Acme Kft.",
      contact_email: "john@acme.hu",
    });

    const { tx, created } = makeTx({ company: { id: 7 }, person: { id: 9 }, contact: { id: 5 } });
    await ingestLead(input, ctx, tx);

    expect(created.contact).toBe(0); // existing link reused
    expect(created.lead).toBe(1);
  });

  it("falls back to the key's appSlug when source_app is omitted", async () => {
    const input = parse({ company_name: "Acme", contact_phone: "+36301234567" });
    const { tx } = makeTx({});
    await ingestLead(input, ctx, tx);
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.sourceApp).toBe("betonscan_landing");
  });

  it("ignores a spoofed payload source_app and always uses the key's appSlug", async () => {
    // A key issued to betonscan_landing must not be able to attribute a lead
    // to another app by sending its own source_app in the body.
    const input = parse({
      company_name: "Acme",
      contact_phone: "+36301234567",
      source_app: "n8n",
    });
    const { tx } = makeTx({});
    await ingestLead(input, ctx, tx);
    // Lead is attributed to the authenticated key, not the payload value.
    const leadData = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(leadData.sourceApp).toBe("betonscan_landing");
    // The app_event is also attributed to the key...
    const eventData = (tx.appEvent.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(eventData.sourceApp).toBe("betonscan_landing");
    // ...while the raw submitted body (incl. the spoofed value) is preserved
    // verbatim in the event payload for traceability.
    expect(eventData.payload.source_app).toBe("n8n");
  });

  it("still creates a person when only a phone is provided (no email to dedupe on)", async () => {
    const input = parse({ company_name: "Acme", contact_phone: "+36301234567" });
    const { tx, created } = makeTx({});
    await ingestLead(input, ctx, tx);
    expect(created.person).toBe(1);
    expect(tx.person.findFirst).not.toHaveBeenCalled(); // no email → no dedupe lookup
  });

  it("uses the caller's pre-tier when there are no qualification answers", async () => {
    const input = parse({ company_name: "Acme", contact_phone: "+36301234567", tier: "A" });
    const { tx, created } = makeTx({});
    const result = await ingestLead(input, ctx, tx);
    expect(result.tier).toBe("A");
    expect(created.lead).toBe(1);
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.tier).toBe("A");
  });

  it("copies the W7 intent and buyer_type answers into the W2 columns (Kai 2026-11-09)", async () => {
    const input = parse({
      company_name: "teszt ltd", contact_phone: "+36301234567", question_set: "w7",
      qualification: { gate: "task", intent: "service_concrete", buyer_type: "company", call_window: "8_10", location: "Budapest" },
    });
    const { tx } = makeTx({});
    await ingestLead(input, ctx, tx);
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data).toMatchObject({ intent: "service_concrete", buyerType: "company" });
    expect(data.qualification).toMatchObject({ call_window: "8_10", location: "Budapest" });
  });

  it("an unknown intent slug leaves the W2 column unset", async () => {
    const input = parse({ company_name: "x", contact_phone: "+36301234567", qualification: { intent: "valami_uj" } });
    const { tx } = makeTx({});
    await ingestLead(input, ctx, tx);
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.intent).toBeUndefined();
  });

  it("a derived tier wins over the caller's pre-tier when answers are present", async () => {
    const input = parse({
      company_name: "Acme",
      contact_phone: "+36301234567",
      tier: "D", // caller's pre-tier — must be overridden by the derived one
      qualification: { situation: "pro" }, // derives to "C"
    });
    const { tx } = makeTx({});
    const result = await ingestLead(input, ctx, tx);
    expect(result.tier).toBe("C");
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.tier).toBe("C");
  });

  it("records intake answers as FORM answers, with the set and campaign", async () => {
    const input = parse({
      company_name: "Acme",
      contact_phone: "+36301234567",
      campaign: "meta-q4-01",
      question_set: "rovid",
      qualification: { situation: "ceg", intent_path: "task" },
    });
    const { tx } = makeTx({});
    await ingestLead(input, ctx, tx);
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    // The map every statistic reads is byte-identical to what it was before
    // provenance existed — `intent_path` still lands as `gate`.
    expect(data.qualification).toEqual({ situation: "ceg", gate: "task" });
    expect(data.answerSources.situation.form).toMatchObject({
      value: "ceg", set: "rovid", campaign: "meta-q4-01",
    });
    expect(typeof data.answerSources.situation.form.at).toBe("string");
    // Nothing was recorded as a setter answer: nobody has called yet.
    expect(data.answerSources.situation.setter).toBeUndefined();
  });

  it("a form that sends no question_set is recorded without one, not rejected", async () => {
    const input = parse({
      company_name: "Acme",
      contact_phone: "+36301234567",
      qualification: { situation: "ceg" },
    });
    const { tx } = makeTx({});
    await ingestLead(input, ctx, tx);
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.qualification).toEqual({ situation: "ceg" });
    expect(data.answerSources.situation.form.set).toBeUndefined();
  });

  it("keeps the pre-tier when answers are present but place nothing", async () => {
    const input = parse({
      company_name: "Acme",
      contact_phone: "+36301234567",
      tier: "A",
      qualification: { size: "kb. 40 m2" }, // no situation/gate → computeTier → null
    });
    const { tx } = makeTx({});
    const result = await ingestLead(input, ctx, tx);
    expect(result.tier).toBe("A");
  });

  it("leaves tier unset when neither a pre-tier nor derivable answers are submitted", async () => {
    const input = parse({ company_name: "Acme", contact_phone: "+36301234567" });
    const { tx } = makeTx({});
    const result = await ingestLead(input, ctx, tx);
    expect(result.tier).toBeNull();
    const data = (tx.lead.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(data.tier).toBeUndefined();
  });
});

describe("leadIntakeSchema", () => {
  it("rejects a payload with neither email nor phone", () => {
    const r = leadIntakeSchema.safeParse({ company_name: "Acme" });
    expect(r.success).toBe(false);
  });

  it("requires company_name", () => {
    const r = leadIntakeSchema.safeParse({ contact_email: "a@b.hu" });
    expect(r.success).toBe(false);
  });

  it("defaults source to 'web'", () => {
    const r = leadIntakeSchema.safeParse({ company_name: "Acme", contact_email: "a@b.hu" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe("web");
  });
});

describe("ingestLead — cold-email reply intake (thread_key)", () => {
  const reply = (extra: Record<string, unknown> = {}) =>
    parse({
      company_name: "Vasmű Zrt.",
      contact_email: "kovacs@vasmu.hu",
      channel: "cold_email",
      campaign: "BirdsView Q4",
      thread_key: "gmail-thread-aaa111",
      draft_key: "birdsview-q4:42",
      ...extra,
    });

  it("is idempotent: a thread key that already has a lead creates nothing", async () => {
    const { tx, created } = makeTx({ lead: { id: 900, companyId: 42, contactId: 7 } });
    const res = await ingestLead(reply(), ctx, tx);

    expect(res.leadId).toBe(900);
    expect(res.deduped).toBe(true);
    // Nothing at all was written — not a lead, not a company, not an audit row.
    expect(created).toEqual({ company: 0, person: 0, contact: 0, lead: 0, auditLog: 0, appEvent: 0 });
  });

  it("attaches the lead to the DRAFT's company, not to a name match", async () => {
    // The replier's signature says something else entirely; the draft wins,
    // because we know exactly who we mailed.
    const { tx, created, lastLeadData } = makeTx({
      draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" },
      company: { id: 999 }, // a name match that must NOT be used
    });
    const res = await ingestLead(reply({ company_name: "valami egészen más" }), ctx, tx);

    expect(res.companyId).toBe(42);
    expect((lastLeadData.value as { companyId: number }).companyId).toBe(42);
    expect(created.company).toBe(0);
    expect(tx.company.findFirst).not.toHaveBeenCalled();
  });

  it("flips the answered draft to replied, and only a SENT one", async () => {
    const { tx, draftUpdates } = makeTx({ draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" } });
    const res = await ingestLead(reply(), ctx, tx);

    expect(res.draftId).toBe(5);
    // 2 calls: the answered draft flips to replied, and any sibling touches on
    // the same company+campaign still sitting at draft/approved are cancelled.
    expect(draftUpdates).toHaveLength(2);
    expect(draftUpdates[0]).toMatchObject({
      where: { id: 5, tenantId: 1, status: "sent" },
      data: { status: "replied" },
    });
  });

  it("stores the thread key on the lead so the next run can find it", async () => {
    const { tx, lastLeadData } = makeTx({ draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" } });
    await ingestLead(reply(), ctx, tx);
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("gmail-thread-aaa111");
  });

  it("a thread key with no matching draft still works and touches no draft", async () => {
    const { tx, created, draftUpdates, lastLeadData } = makeTx({});
    const res = await ingestLead(reply(), ctx, tx);

    expect(res.deduped).toBe(false);
    expect(res.draftId).toBeNull();
    expect(draftUpdates).toHaveLength(0);
    expect(created.lead).toBe(1);
    // No draft to vouch for the claimed key: it is stored app-namespaced, never raw.
    expect((lastLeadData.value as { threadKey: string | null }).threadKey).toBe("app~betonscan_landing~gmail-thread-aaa111");
  });

  it("an ordinary lead with no thread key is unaffected", async () => {
    const { tx, created, draftUpdates, lastLeadData } = makeTx({});
    const res = await ingestLead(
      parse({ company_name: "Acme Kft.", contact_email: "a@acme.hu" }),
      ctx,
      tx,
    );
    expect(res.deduped).toBe(false);
    expect(draftUpdates).toHaveLength(0);
    expect(created.lead).toBe(1);
    expect((lastLeadData.value as { threadKey: string | null }).threadKey).toBeNull();
  });
});

describe("ingestLead — thread_key is per CONVERSATION, draft_key per OUTREACH", () => {
  // The bug this pins: both keys used to be the same value, so the contract was
  // one lead per campaign+company instead of one lead per thread. A prospect who
  // replied "not now" to touch 1 and "send the quote" three weeks later had the
  // second reply silently swallowed as a duplicate. (Vanda, #89.)
  it("a SECOND reply on a different thread in the same campaign creates a new lead", async () => {
    const { tx, created } = makeTx({
      // A lead already exists for touch 1 of this campaign+company...
      lead: null, // ...but not for THIS conversation id.
      draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" },
    });
    const res = await ingestLead(
      parse({
        company_name: "Vasmű Zrt.",
        contact_email: "kovacs@vasmu.hu",
        channel: "cold_email",
        campaign: "BirdsView Q4",
        thread_key: "gmail-thread-SECOND",
        draft_key: "birdsview-q4:42", // same outreach, later touch
      }),
      ctx,
      tx,
    );
    expect(res.deduped).toBe(false);
    expect(created.lead).toBe(1);
    // It still links to the same outreach.
    expect(res.draftId).toBe(5);
  });

  it("the draft is resolved by draft_key, never by the conversation key", async () => {
    const { tx } = makeTx({ draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" } });
    await ingestLead(
      parse({
        company_name: "x",
        contact_email: "a@b.hu",
        channel: "cold_email",
        thread_key: "gmail-thread-aaa111",
        draft_key: "birdsview-q4:42",
      }),
      ctx,
      tx,
    );
    expect(tx.emailDraft.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 1, threadKey: "birdsview-q4:42" } }),
    );
  });

  it("marks exactly ONE draft row replied, by id, not every row sharing the key", async () => {
    const { tx, draftUpdates } = makeTx({ draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" } });
    await ingestLead(
      parse({
        company_name: "x",
        contact_email: "a@b.hu",
        channel: "cold_email",
        thread_key: "gmail-thread-aaa111",
        draft_key: "birdsview-q4:42",
      }),
      ctx,
      tx,
    );
    expect(draftUpdates[0]).toMatchObject({ where: { id: 5, tenantId: 1, status: "sent" } });
  });

  it("a reply with no draft_key still dedupes on the conversation", async () => {
    const { tx, created } = makeTx({ lead: { id: 900, companyId: 42, contactId: 7 } });
    const res = await ingestLead(
      parse({ company_name: "x", contact_email: "a@b.hu", channel: "cold_email", thread_key: "gmail-thread-aaa111" }),
      ctx,
      tx,
    );
    expect(res.deduped).toBe(true);
    expect(res.leadId).toBe(900);
    expect(created.lead).toBe(0);
  });
});

describe("ingestLead — tenant scoping has no DB backstop, so the lookup must carry it", () => {
  it("a lead in another tenant with the same thread key does NOT dedupe — a new lead is created", async () => {
    const { tx, created } = makeTx({
      // Same thread key, but tenant 2 — must be invisible to tenant 1's ingest.
      lead: { id: 900, companyId: 42, contactId: 7, tenantId: 2, threadKey: "gmail-thread-aaa111" },
    });
    const res = await ingestLead(
      parse({
        company_name: "Vasmű Zrt.",
        contact_email: "kovacs@vasmu.hu",
        channel: "cold_email",
        thread_key: "gmail-thread-aaa111",
      }),
      ctx, // tenantId: 1
      tx,
    );
    expect(res.deduped).toBe(false);
    expect(created.lead).toBe(1);
  });

  it("a case-variant thread_key still normalises and dedupes to the canonical lowercase key", async () => {
    const { tx, created } = makeTx({
      lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: "app~betonscan_landing~gmail-thread-aaa111" },
    });
    const input = parse({
      company_name: "Vasmű Zrt.",
      contact_email: "kovacs@vasmu.hu",
      channel: "cold_email",
      thread_key: "Gmail-Thread-AAA111",
    });
    // The schema's preprocess already lowercased it before ingest ever sees it.
    expect(input.thread_key).toBe("gmail-thread-aaa111");

    const res = await ingestLead(input, ctx, tx);
    expect(res.deduped).toBe(true);
    expect(res.leadId).toBe(900);
    expect(created.lead).toBe(0);
  });
});

describe("ingestLead - app-namespaced thread keys (no draft vouching)", () => {
  const growth = { tenantId: 1, appSlug: "growth" };
  const intake = (extra: Record<string, unknown> = {}) =>
    parse({
      company_name: "Vasmű Zrt.",
      contact_email: "kovacs@vasmu.hu",
      channel: "cold_email",
      thread_key: "Thread-ABC",
      ...extra,
    });

  it("stores app~growth~<key lowercased> when no draft vouched", async () => {
    const { tx, lastLeadData } = makeTx({});
    await ingestLead(intake(), growth, tx);
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("app~growth~thread-abc");
  });

  it("a second intake with the same key dedupes without creating a lead", async () => {
    const { tx, created } = makeTx({
      lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: "app~growth~thread-abc" },
    });
    const res = await ingestLead(intake(), growth, tx);
    expect(res.deduped).toBe(true);
    expect(res.leadId).toBe(900);
    expect(created.lead).toBe(0);
  });

  it("another app sending the same raw key does not match growth's lead", async () => {
    const { tx, created, lastLeadData } = makeTx({
      lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: "app~growth~thread-abc" },
    });
    const res = await ingestLead(intake(), { tenantId: 1, appSlug: "otherapp" }, tx);
    expect(res.deduped).toBe(false);
    expect(created.lead).toBe(1);
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("app~otherapp~thread-abc");
  });

  it("a draft-vouched key is still stored raw", async () => {
    const { tx, lastLeadData } = makeTx({ draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" } });
    await ingestLead(intake({ draft_key: "birdsview-q4:42", campaign: "BirdsView Q4" }), growth, tx);
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("thread-abc");
  });

  it("a draft-vouched post cannot send an app~ thread_key (schema rejects it)", () => {
    expect(leadIntakeSchema.safeParse({
      company_name: "X", contact_email: "a@b.hu", channel: "cold_email",
      thread_key: "app~growth~thread-abc", draft_key: "birdsview-q4:42",
    }).success).toBe(false);
  });

  it("an unvouched post does NOT dedupe onto a draft-vouched lead stored with the raw key", async () => {
    const { tx, created, lastLeadData } = makeTx({
      lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: "thread-abc" },
    });
    const res = await ingestLead(intake(), growth, tx);
    expect(res.deduped).toBe(false);
    expect(created.lead).toBe(1);
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("app~growth~thread-abc");
  });

  it("a vouched post still dedupes on the raw key", async () => {
    const { tx, created } = makeTx({
      draft: { id: 5, companyId: 42, campaign: "BirdsView Q4" },
      lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: "thread-abc" },
    });
    const res = await ingestLead(intake({ draft_key: "birdsview-q4:42", campaign: "BirdsView Q4" }), growth, tx);
    expect(res.deduped).toBe(true);
    expect(res.leadId).toBe(900);
    expect(created.lead).toBe(0);
  });

  it("a non cold_email intake stores no thread key", async () => {
    const { tx, lastLeadData } = makeTx({});
    await ingestLead(intake({ channel: "landing" }), growth, tx);
    expect((lastLeadData.value as { threadKey: string | null }).threadKey).toBeNull();
  });
});

describe("ingestLead - attribution passthrough and idempotency_key", () => {
  const landing = { tenantId: 1, appSlug: "betonscan_landing" };
  const form = (extra: Record<string, unknown> = {}) =>
    parse({ company_name: "Minta Kft.", contact_email: "a@minta.hu", channel: "landing", ...extra });

  it("the schema keeps the new attribution fields and bounds their length", () => {
    const ok = form({
      gclid: "G1", fbclid: "F1", entry_path: "/", submit_path: "/tarcsavagas", landing_route: "tarcsavagas",
      last_touch_utm_source: "google", last_touch_utm_medium: "cpc", last_touch_utm_campaign: "c", last_touch_utm_content: "x",
      last_touch_utm_term: "t", last_touch_referrer: "https://google.com/", idempotency_key: "Abc-123",
    });
    expect(ok).toMatchObject({ gclid: "G1", landing_route: "tarcsavagas", last_touch_referrer: "https://google.com/", idempotency_key: "abc-123" });
    for (const f of ["gclid", "fbclid", "entry_path", "submit_path", "landing_route", "last_touch_utm_source", "last_touch_referrer", "idempotency_key"]) {
      expect(leadIntakeSchema.safeParse({ company_name: "x", contact_email: "a@b.hu", [f]: "x".repeat(2001) }).success, f).toBe(false);
    }
  });

  it("all of them land in customFields; the idempotency key does not", async () => {
    const { tx, lastLeadData } = makeTx({});
    await ingestLead(form({ gclid: "G1", fbclid: "F1", entry_path: "/", submit_path: "/x", landing_route: "r", last_touch_utm_source: "google", last_touch_referrer: "https://g.co/", utm_source: "first", idempotency_key: "k1" }), landing, tx);
    const cf = (lastLeadData.value as { customFields: Record<string, unknown> }).customFields;
    expect(cf).toMatchObject({ gclid: "G1", fbclid: "F1", entry_path: "/", submit_path: "/x", landing_route: "r", last_touch_utm_source: "google", last_touch_referrer: "https://g.co/", utm_source: "first" });
    expect(cf).not.toHaveProperty("idempotency_key");
  });

  it("legacy payload without the new fields is unchanged: no new keys, no thread key", async () => {
    const { tx, lastLeadData } = makeTx({});
    await ingestLead(form({ utm_source: "x" }), landing, tx);
    const d = lastLeadData.value as { customFields: Record<string, unknown>; threadKey: string | null };
    expect(Object.keys(d.customFields)).not.toContain("gclid");
    expect(d.threadKey).toBeNull();
  });

  it("stores the key app-namespaced; a repeat returns the first lead and writes nothing", async () => {
    const { tx, lastLeadData } = makeTx({});
    await ingestLead(form({ idempotency_key: "K-1" }), landing, tx);
    const stored = (lastLeadData.value as { threadKey: string }).threadKey;
    expect(stored).toBe("app~betonscan_landing~idem~k-1");

    const again = makeTx({ lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: stored } });
    const res = await ingestLead(form({ idempotency_key: "K-1" }), landing, again.tx);
    expect(res).toMatchObject({ deduped: true, leadId: 900, companyId: 42 });
    expect(again.created).toMatchObject({ lead: 0, company: 0, person: 0, contact: 0, auditLog: 0, appEvent: 0 });
  });

  it("another app, or another key, is a new lead", async () => {
    const seeded = { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: "app~betonscan_landing~idem~k-1" };
    const a = makeTx({ lead: seeded });
    expect((await ingestLead(form({ idempotency_key: "K-1" }), { tenantId: 1, appSlug: "other" }, a.tx)).deduped).toBe(false);
    const b = makeTx({ lead: seeded });
    expect((await ingestLead(form({ idempotency_key: "K-2" }), landing, b.tx)).deduped).toBe(false);
  });

  it("a cold-email reply keeps its thread_key; the idempotency key does not override it", async () => {
    const { tx, lastLeadData } = makeTx({});
    await ingestLead(form({ channel: "cold_email", thread_key: "Thread-ABC", idempotency_key: "k9" }), landing, tx);
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("app~betonscan_landing~thread-abc");
  });
});

describe("ingestLead - idempotency repeat reports what the route needs to recover effects", () => {
  const landing = { tenantId: 1, appSlug: "betonscan_landing" };
  const key = "app~betonscan_landing~idem~k-1";
  const input = () => parse({ company_name: "Minta Kft.", contact_email: "a@minta.hu", channel: "landing", idempotency_key: "k-1" });
  const created = new Date("2026-11-12T10:00:00Z");

  it("unmarked: effectsDone false, with the lead's age and person", async () => {
    const { tx } = makeTx({ lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: key, createdAt: created, customFields: { utm_source: "x" }, contact: { personId: 8 } } });
    expect(await ingestLead(input(), landing, tx)).toMatchObject({ deduped: true, viaIdempotencyKey: true, leadCreatedAt: created, effectsDone: false, personId: 8 });
  });
  it("marked: effectsDone true", async () => {
    const { tx } = makeTx({ lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: key, createdAt: created, customFields: { effects_done_at: "2026-11-12T10:00:03Z" } } });
    expect(await ingestLead(input(), landing, tx)).toMatchObject({ deduped: true, viaIdempotencyKey: true, effectsDone: true });
  });
  it("a thread_key dedupe is not flagged as an idempotency repeat", async () => {
    const { tx } = makeTx({ lead: { id: 900, companyId: 42, contactId: 7, tenantId: 1, threadKey: "app~growth~thread-abc" } });
    const r = await ingestLead(parse({ company_name: "V", contact_email: "k@v.hu", channel: "cold_email", thread_key: "Thread-ABC" }), { tenantId: 1, appSlug: "growth" }, tx);
    expect(r.deduped).toBe(true);
    expect(r.viaIdempotencyKey).toBeUndefined();
  });
});
