import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const { db } = vi.hoisted(() => ({
  db: {
    company: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    campaign: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    contentVersion: { findMany: vi.fn() },
    emailDraft: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db }));

import { POST } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";

const KEY = { keyId: 1, tenantId: 1, appSlug: "outreach-drafter" };
const COMPANY_ID = 5;

function req(drafts: unknown[]) {
  return new Request("http://x/api/outreach/drafts", {
    method: "POST",
    headers: { authorization: "Bearer helm_x", "content-type": "application/json" },
    body: JSON.stringify({ drafts }),
  });
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    companyId: COMPANY_ID,
    campaign: "wave1",
    step: 1,
    subject: "Hi",
    body: "Body",
    ...overrides,
  };
}

// Every case below assumes tenant 1, one company the tenant owns, and no
// personId/templateVersionId claims (out of scope for the sender/wave bug).
beforeEach(() => {
  vi.clearAllMocks();
  (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
  db.company.findMany.mockResolvedValue([{ id: COMPANY_ID }]);
  db.contact.findMany.mockResolvedValue([]);
  db.contentVersion.findMany.mockResolvedValue([]);
  db.campaign.findFirst.mockResolvedValue(null);
  db.user.findMany.mockResolvedValue([]);
  db.emailDraft.findUnique.mockResolvedValue(null);
  db.emailDraft.create.mockResolvedValue({ id: 1, companyId: COMPANY_ID, campaign: "wave1", step: 1, status: "draft" });
  db.emailDraft.update.mockResolvedValue({ id: 1, subject: "Hi", body: "Body", toEmail: null });
});

describe("POST /api/outreach/drafts campaign sender/wave defaulting", () => {
  it("defaults senderUserId and wave from the campaign row when the payload omits both", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: 3, currentWave: 2, audienceViewId: null, isArchived: false,
    });
    db.user.findMany.mockResolvedValue([{ id: 3 }]);

    const res = await POST(req([draft()]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);

    expect(db.emailDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderUserId: 3, wave: 2 }),
      }),
    );
  });

  it("payload-stated senderUserId wins over the campaign default", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: 3, currentWave: 2, audienceViewId: null, isArchived: false,
    });
    db.user.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);

    await POST(req([draft({ senderUserId: 2 })]));

    expect(db.emailDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderUserId: 2 }) }),
    );
  });

  it("an explicit null senderUserId is stored as null, not the campaign default", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: 3, currentWave: 2, audienceViewId: null, isArchived: false,
    });
    db.user.findMany.mockResolvedValue([{ id: 3 }]);

    await POST(req([draft({ senderUserId: null })]));

    expect(db.emailDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderUserId: null }) }),
    );
  });

  it("no campaigns row (legacy free-string key) behaves exactly as before: no sender/wave stamped", async () => {
    db.campaign.findFirst.mockResolvedValue(null);

    await POST(req([draft({ campaign: "TESZT" })]));

    const call = db.emailDraft.create.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("senderUserId");
    expect(call.data).not.toHaveProperty("wave");
  });

  it("a campaign-default sender who is not a user of this tenant is dropped to null", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: 3, currentWave: 2, audienceViewId: null, isArchived: false,
    });
    // senderUserId 3 is looked up but does not come back as belonging to the tenant.
    db.user.findMany.mockResolvedValue([]);

    await POST(req([draft()]));

    expect(db.emailDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderUserId: null }) }),
    );
  });

  it("the update branch never defaults: an existing draft row omitting the fields is left untouched", async () => {
    db.campaign.findFirst.mockResolvedValue({
      id: 9, name: "Wave 1", slug: "wave1", senderUserId: 3, currentWave: 2, audienceViewId: null, isArchived: false,
    });
    db.user.findMany.mockResolvedValue([{ id: 3 }]);
    db.emailDraft.findUnique.mockResolvedValue({
      id: 42, status: "draft", subject: "Old", body: "Old body", toEmail: null,
    });

    await POST(req([draft()]));

    expect(db.emailDraft.update).toHaveBeenCalled();
    const call = db.emailDraft.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("senderUserId");
    expect(call.data).not.toHaveProperty("wave");
  });

  it("resolves each distinct campaign string once, not once per item", async () => {
    db.campaign.findFirst.mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve(
        where.slug === "wave1"
          ? { id: 9, name: "Wave 1", slug: "wave1", senderUserId: 3, currentWave: 2, audienceViewId: null, isArchived: false }
          : { id: 10, name: "Wave 2", slug: "wave2", senderUserId: null, currentWave: 5, audienceViewId: null, isArchived: false },
      ),
    );
    db.user.findMany.mockResolvedValue([{ id: 3 }]);

    await POST(req([
      draft({ campaign: "wave1", step: 1 }),
      draft({ campaign: "wave1", step: 2 }),
      draft({ campaign: "wave2", step: 1 }),
    ]));

    expect(db.campaign.findFirst).toHaveBeenCalledTimes(2);
    expect(db.emailDraft.create).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ data: expect.objectContaining({ senderUserId: 3, wave: 2 }) }),
    );
    expect(db.emailDraft.create).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ data: expect.objectContaining({ senderUserId: 3, wave: 2 }) }),
    );
    expect(db.emailDraft.create).toHaveBeenNthCalledWith(3,
      expect.objectContaining({ data: expect.objectContaining({ wave: 5 }) }),
    );
  });
});
