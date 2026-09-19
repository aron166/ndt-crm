import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/content/service", () => ({
  createItem: vi.fn(),
  addChecks: vi.fn(),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const tx = {
  campaign: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  contentAsset: { createMany: vi.fn() },
  appEvent: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    // The existed branch hashes the current body so an importer can spot a
    // changed source file (--refresh).
    contentVersion: { findFirst: vi.fn().mockResolvedValue({ body: "current body" }) },
  },
}));

import { POST } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";
import { createItem, addChecks } from "@/lib/content/service";

const KEY = { keyId: 1, tenantId: 7, appSlug: "content-factory" };
const VALID_BODY = {
  channel: "blog",
  content_type: "email",
  title: "Hello",
  body: "Body text",
};

function req(body: unknown) {
  return new Request("http://x/api/content", {
    method: "POST",
    headers: { authorization: "Bearer helm_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.campaign.findFirst.mockResolvedValue(null);
  tx.campaign.create.mockResolvedValue({ id: 1 });
  (addChecks as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, created: 0 });
});

describe("POST /api/content", () => {
  it("401s without a valid key", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("201s and derives category from content_type on a new item", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, itemId: 10, versionId: 20, existed: false, status: "in_review", ruleChecks: 0,
    });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, contentItemId: 10, versionId: 20, status: "in_review", checksCreated: 0, ruleChecks: 0 });
    expect(createItem).toHaveBeenCalledWith(
      { tenantId: 7, kind: "app", appSlug: "content-factory" },
      expect.objectContaining({ category: "email" }),
      tx,
    );
    expect(tx.contentAsset.createMany).not.toHaveBeenCalled();
    expect(addChecks).not.toHaveBeenCalled(); // import not set → no extraction
  });

  it("import: true extracts ⚠ warnings into checks after commit, returns checksCreated", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, itemId: 10, versionId: 20, existed: false, status: "in_review", ruleChecks: 0,
    });
    (addChecks as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, created: 2 });
    const res = await POST(req({ ...VALID_BODY, body: "⚠️ Áron dönti el.\n⚠️ Péter dönti el.", import: true }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.checksCreated).toBe(2);
    expect(addChecks).toHaveBeenCalledWith(
      { tenantId: 7, kind: "app", appSlug: "content-factory" },
      10,
      [
        { question: "Áron dönti el.", forWhom: "aron", source: "import" },
        { question: "Péter dönti el.", forWhom: "peter", source: "import" },
      ],
    );
  });

  it("addChecks failure does not fail the request (item already created)", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, itemId: 10, versionId: 20, existed: false, status: "in_review", ruleChecks: 0,
    });
    (addChecks as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    const res = await POST(req({ ...VALID_BODY, body: "⚠️ Áron dönti el.", import: true }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.checksCreated).toBe(0);
  });

  it("category: decision creates one addressed open check from the title", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, itemId: 10, versionId: 20, existed: false, status: "in_review", ruleChecks: 0,
    });
    (addChecks as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, created: 1 });
    const res = await POST(req({ ...VALID_BODY, category: "decision", title: "Melyik csomagot indítsuk?", decided_by: "peter" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.checksCreated).toBe(1);
    expect(addChecks).toHaveBeenCalledWith(
      { tenantId: 7, kind: "app", appSlug: "content-factory" },
      10,
      [{ question: "Melyik csomagot indítsuk?", forWhom: "peter", source: "decision" }],
    );
  });

  it("category: decision with an INVALID decided_by is a 400 for the whole intake (zod rejects it; it does NOT default to 'either')", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    const res = await POST(req({
      ...VALID_BODY, category: "decision", title: "Melyik csomagot indítsuk?", decided_by: "valaki-mas",
    }));
    expect(res.status).toBe(400);
    expect(createItem).not.toHaveBeenCalled();
    expect(addChecks).not.toHaveBeenCalled();
  });

  it("existed → 200, no asset write", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, itemId: 10, versionId: 20, existed: true, status: "in_review",
    });
    const res = await POST(req({ ...VALID_BODY, assets: [{ kind: "image", url: "https://x/y.png" }], external_ref: "ref-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, contentItemId: 10, versionId: 20, existed: true, status: "in_review" });
    expect(tx.contentAsset.createMany).not.toHaveBeenCalled();
    expect(tx.appEvent.create).not.toHaveBeenCalled();
  });
});
