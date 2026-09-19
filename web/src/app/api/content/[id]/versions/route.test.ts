import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({
  validateAppKey: vi.fn(),
  rateLimit: vi.fn(() => true),
}));
vi.mock("@/lib/content/service", () => ({ createVersion: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { POST } from "./route";
import { validateAppKey } from "@/lib/app-key-auth";
import { createVersion } from "@/lib/content/service";

const KEY = { keyId: 1, tenantId: 7, appSlug: "content-revise" };

function req(body: unknown) {
  return new Request("http://x/api/content/5/versions", {
    method: "POST",
    headers: { authorization: "Bearer helm_x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function params(id = "5") {
  return { params: Promise.resolve({ id }) };
}

const VALID = { body: "new body", change_note: "addressed comment", based_on_version_id: 1 };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/content/:id/versions", () => {
  it("401s without a valid key", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(401);
  });

  it("400s when change_note is missing", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    const { change_note: _omit, ...rest } = VALID;
    const res = await POST(req(rest), params());
    expect(res.status).toBe(400);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("201s on success", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, versionId: 9, number: 2 });
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, versionId: 9, number: 2 });
  });

  it("passes internal: true through to createVersion", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, versionId: 9, number: 2 });
    await POST(req({ ...VALID, internal: true }), params());
    expect(createVersion).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ internal: true }));
  });

  it("omitting internal passes undefined, not false", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createVersion as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, versionId: 9, number: 2 });
    await POST(req(VALID), params());
    expect(createVersion).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ internal: undefined }));
  });

  it("maps a service 409 (race rule) to HTTP 409", async () => {
    (validateAppKey as ReturnType<typeof vi.fn>).mockResolvedValue(KEY);
    (createVersion as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 409, error: "Stale base: a newer version exists",
    });
    const res = await POST(req(VALID), params());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Stale base: a newer version exists");
  });
});
