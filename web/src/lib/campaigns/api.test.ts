import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAppKey } from "@/lib/app-key-auth";
import { getActor } from "@/lib/actor";
import { campaignCtx } from "./api";

vi.mock("@/lib/app-key-auth", () => ({ validateAppKey: vi.fn(), rateLimit: vi.fn().mockReturnValue(true) }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "not a CRM user" }));

type M = ReturnType<typeof vi.fn>;
const withKey = () => new Request("http://x/api/campaigns/bp/approve", { method: "POST", headers: { authorization: "Bearer k" } });

describe("campaignCtx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (validateAppKey as M).mockResolvedValue({ keyId: 1, tenantId: 1, appSlug: "corvid" });
  });
  it("an app key gets an agent ctx on shared routes", async () => {
    const r = await campaignCtx(withKey());
    expect(r).toEqual({ ctx: { tenantId: 1, userId: null, appSlug: "corvid" } });
  });
  it("forwards the key's scopes into ctx", async () => {
    (validateAppKey as M).mockResolvedValue({ keyId: 1, tenantId: 1, appSlug: "corvid", scopes: ["prospects:write"] });
    const r = await campaignCtx(withKey());
    expect(r).toMatchObject({ ctx: { scopes: ["prospects:write"] } });
  });
  it("a session-only route ignores the key and needs a CRM user", async () => {
    (getActor as M).mockResolvedValue({ userId: null });
    const r = await campaignCtx(withKey(), { sessionOnly: true });
    expect(validateAppKey).not.toHaveBeenCalled();
    expect("res" in r && r.res.status).toBe(403);
  });
  it("a bad key is 401, never a fallback to the session", async () => {
    (validateAppKey as M).mockResolvedValue(null);
    const r = await campaignCtx(withKey());
    expect("res" in r && r.res.status).toBe(401);
    expect(getActor).not.toHaveBeenCalled();
  });
});
