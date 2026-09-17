import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/content/service", () => ({
  createItem: vi.fn(),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const tx = {
  campaign: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  contentAsset: { createMany: vi.fn() },
  appEvent: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)) },
}));

import { POST } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";
import { createItem } from "@/lib/content/service";

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
      ok: true, itemId: 10, versionId: 20, existed: false,
    });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, contentItemId: 10, versionId: 20, status: "in_review" });
    expect(createItem).toHaveBeenCalledWith(
      { tenantId: 7, kind: "app", appSlug: "content-factory" },
      expect.objectContaining({ category: "email" }),
      tx,
    );
    expect(tx.contentAsset.createMany).not.toHaveBeenCalled();
  });

  it("existed → 200, no asset write", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, itemId: 10, versionId: 20, existed: true,
    });
    const res = await POST(req({ ...VALID_BODY, assets: [{ kind: "image", url: "https://x/y.png" }], external_ref: "ref-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, contentItemId: 10, versionId: 20, existed: true });
    expect(tx.contentAsset.createMany).not.toHaveBeenCalled();
    expect(tx.appEvent.create).not.toHaveBeenCalled();
  });
});
