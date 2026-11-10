import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/suppression/cancel", () => ({ cancelQueuedDraftsFor: vi.fn(async () => 2) }));

const { db } = vi.hoisted(() => ({
  db: { suppression: { findFirst: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db }));

import { POST } from "./route";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { cancelQueuedDraftsFor } from "@/lib/suppression/cancel";

const KEY = { keyId: 1, tenantId: 1, appSlug: "growth" };

function req(body: unknown, raw = false) {
  return new Request("http://x/api/suppressions", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
  (rateLimit as ReturnType<typeof vi.fn>).mockReturnValue(true);
  db.suppression.findFirst.mockResolvedValue(null);
  db.suppression.create.mockResolvedValue({ id: 11 });
});

describe("POST /api/suppressions", () => {
  it("401 without a valid key and writes nothing", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req({ email: "a@b.hu" }));
    expect(res.status).toBe(401);
    expect(db.suppression.create).not.toHaveBeenCalled();
    expect(cancelQueuedDraftsFor).not.toHaveBeenCalled();
  });

  it("429 when the rate limit is exceeded", async () => {
    (rateLimit as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await POST(req({ email: "a@b.hu" }));
    expect(res.status).toBe(429);
    expect(db.suppression.create).not.toHaveBeenCalled();
  });

  it("400 on bad JSON", async () => {
    expect((await POST(req("{nope", true))).status).toBe(400);
  });

  it("400 on an invalid email", async () => {
    expect((await POST(req({ email: "not-an-email" }))).status).toBe(400);
    expect(db.suppression.create).not.toHaveBeenCalled();
  });

  it("400 on a future requested_at", async () => {
    const res = await POST(req({ email: "a@b.hu", requested_at: "2999-01-01" }));
    expect(res.status).toBe(400);
    expect(db.suppression.create).not.toHaveBeenCalled();
  });

  it("400 on an unknown extra field (strict)", async () => {
    const res = await POST(req({ email: "a@b.hu", surprise: 1 }));
    expect(res.status).toBe(400);
    expect(db.suppression.create).not.toHaveBeenCalled();
  });

  it("201 created for a new address: normalised email, app-prefixed source, drafts cancelled", async () => {
    const res = await POST(req({ email: "  Foo@Bar.HU ", source: "unsubscribe link" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, created: true });
    const data = db.suppression.create.mock.calls[0][0].data;
    expect(data.email).toBe("foo@bar.hu");
    expect(data.source).toBe("growth: unsubscribe link");
    expect(data.tenantId).toBe(1);
    expect(cancelQueuedDraftsFor).toHaveBeenCalledWith(1, { email: "foo@bar.hu", domain: null }, expect.anything());
  });

  it("200 created:false for an existing address and no create", async () => {
    db.suppression.findFirst.mockResolvedValue({ id: 5 });
    const res = await POST(req({ email: "foo@bar.hu" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, created: false });
    expect(db.suppression.create).not.toHaveBeenCalled();
    expect(cancelQueuedDraftsFor).not.toHaveBeenCalled();
  });

  it("200 created:false when create loses a P2002 race", async () => {
    db.suppression.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 6 });
    db.suppression.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    const res = await POST(req({ email: "foo@bar.hu" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: false, id: 6 });
  });
});
