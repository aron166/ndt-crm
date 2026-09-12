import { describe, it, expect, vi } from "vitest";
import { ingestLead, type LeadTx } from "./ingest";
import { leadIntakeSchema, type LeadIntake } from "./schema";

// A tiny in-memory fake of the Prisma transaction client. Each model tracks
// what findFirst should return and counts create calls so we can assert on
// dedupe behaviour without a database.
function makeTx(seed: {
  company?: { id: number } | null;
  person?: { id: number } | null;
  contact?: { id: number } | null;
  /** An existing lead on this thread key — the idempotency fixture. */
  lead?: { id: number; companyId: number | null; contactId: number | null } | null;
  /** A sent draft this reply answers. */
  draft?: { id: number; companyId: number; personId: number | null } | null;
}) {
  let nextId = 100;
  const created = {
    company: 0, person: 0, contact: 0, lead: 0, auditLog: 0, appEvent: 0,
  };
  const draftUpdates: unknown[] = [];
  const lastLeadData: { value?: unknown } = {};

  const tx: LeadTx = {
    company: {
      findFirst: vi.fn(async () => seed.company ?? null),
      create: vi.fn(async () => { created.company++; return { id: ++nextId }; }),
    },
    person: {
      findFirst: vi.fn(async () => seed.person ?? null),
      create: vi.fn(async () => { created.person++; return { id: ++nextId }; }),
    },
    contact: {
      findFirst: vi.fn(async () => seed.contact ?? null),
      create: vi.fn(async () => { created.contact++; return { id: ++nextId }; }),
    },
    lead: {
      create: vi.fn(async (args) => { created.lead++; lastLeadData.value = args.data; return { id: ++nextId }; }),
      findFirst: vi.fn(async () => seed.lead ?? null),
    },
    emailDraft: {
      findFirst: vi.fn(async () => seed.draft ?? null),
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
      thread_key: "birdsview-q4:42",
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
      draft: { id: 5, companyId: 42, personId: null },
      company: { id: 999 }, // a name match that must NOT be used
    });
    const res = await ingestLead(reply({ company_name: "valami egészen más" }), ctx, tx);

    expect(res.companyId).toBe(42);
    expect((lastLeadData.value as { companyId: number }).companyId).toBe(42);
    expect(created.company).toBe(0);
    expect(tx.company.findFirst).not.toHaveBeenCalled();
  });

  it("flips the answered draft to replied, and only a SENT one", async () => {
    const { tx, draftUpdates } = makeTx({ draft: { id: 5, companyId: 42, personId: null } });
    const res = await ingestLead(reply(), ctx, tx);

    expect(res.draftId).toBe(5);
    expect(draftUpdates).toHaveLength(1);
    expect(draftUpdates[0]).toMatchObject({
      where: { tenantId: 1, threadKey: "birdsview-q4:42", status: "sent" },
      data: { status: "replied" },
    });
  });

  it("stores the thread key on the lead so the next run can find it", async () => {
    const { tx, lastLeadData } = makeTx({ draft: { id: 5, companyId: 42, personId: null } });
    await ingestLead(reply(), ctx, tx);
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("birdsview-q4:42");
  });

  it("a thread key with no matching draft still works and touches no draft", async () => {
    const { tx, created, draftUpdates, lastLeadData } = makeTx({});
    const res = await ingestLead(reply(), ctx, tx);

    expect(res.deduped).toBe(false);
    expect(res.draftId).toBeNull();
    expect(draftUpdates).toHaveLength(0);
    expect(created.lead).toBe(1);
    // No draft to trust, so the normal name dedupe applies.
    expect((lastLeadData.value as { threadKey: string }).threadKey).toBe("birdsview-q4:42");
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
