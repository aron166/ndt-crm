import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashAppKey, keyAllows, parseScopes, requiredScope, validateAppKey } from "./app-key-auth";

vi.mock("@/lib/db", () => ({ db: { appApiKey: { findUnique: vi.fn(), update: vi.fn() } } }));

type M = ReturnType<typeof vi.fn>;
const find = db.appApiKey.findUnique as unknown as M;
const upd = db.appApiKey.update as unknown as M;

describe("parseScopes", () => {
  it("null is legacy", () => expect(parseScopes(null)).toBeNull());
  it("keeps known scopes", () => expect(parseScopes("leads:write read")).toEqual(["leads:write", "read"]));
  it("unknown only or empty fails closed", () => {
    expect(parseScopes("bogus")).toEqual([]);
    expect(parseScopes("")).toEqual([]);
  });
  it("dedupes and tolerates extra whitespace and newlines", () => {
    expect(parseScopes("  read\n\nread \t prospects:write  bogus ")).toEqual(["read", "prospects:write"]);
  });
});

describe("requiredScope", () => {
  it.each([
    ["POST", "/api/leads", "leads:write"],
    ["GET", "/api/leads", "read"],
    ["HEAD", "/api/leads", "read"],
    ["POST", "/api/events", "leads:write"],
    ["POST", "/api/campaigns/x/members", "prospects:write"],
    ["DELETE", "/api/campaigns/x/members", "prospects:write"],
    ["GET", "/api/campaigns/x/members", "read"],
    ["POST", "/api/campaigns/x/outcome", "legacy"],
    ["POST", "/api/content", "legacy"],
    ["POST", "/api/campaigns/x/members/extra", "legacy"],
  ])("%s %s -> %s", (m, p, want) => expect(requiredScope(m, p)).toBe(want));
});

describe("keyAllows", () => {
  it("legacy key passes everything", () => expect(keyAllows(null, "legacy")).toBe(true));
  it("a scoped key never passes legacy", () => expect(keyAllows(["read"], "legacy")).toBe(false));
});

describe("validateAppKey", () => {
  const req = (method: string, path: string) =>
    new Request(`http://x${path}`, { method, headers: { authorization: "Bearer helm_k" } });
  const rec = (scopes: string | null, isActive = true) =>
    find.mockResolvedValue({ id: 1, tenantId: 1, appSlug: "a", isActive, keyHash: hashAppKey("helm_k"), scopes });
  beforeEach(() => {
    vi.clearAllMocks();
    upd.mockResolvedValue({});
  });
  it("legacy key passes every route", async () => {
    rec(null);
    for (const [m, p] of [["POST", "/api/leads"], ["GET", "/api/leads"], ["POST", "/api/content"], ["DELETE", "/api/campaigns/x/members"]]) {
      expect(await validateAppKey(req(m, p))).toMatchObject({ keyId: 1, scopes: null });
    }
  });
  it("leads:write passes POST /api/leads, refused on GET /api/leads and POST /api/content", async () => {
    rec("leads:write");
    expect(await validateAppKey(req("POST", "/api/leads"))).toMatchObject({ scopes: ["leads:write"] });
    expect(await validateAppKey(req("GET", "/api/leads"))).toBeNull();
    expect(await validateAppKey(req("POST", "/api/content"))).toBeNull();
  });
  it("read passes GET and HEAD, refused on POST /api/leads", async () => {
    rec("read");
    expect(await validateAppKey(req("GET", "/api/leads"))).not.toBeNull();
    expect(await validateAppKey(req("HEAD", "/api/leads"))).not.toBeNull();
    expect(await validateAppKey(req("POST", "/api/leads"))).toBeNull();
  });
  it("an empty scope string is refused everywhere", async () => {
    rec("");
    for (const [m, p] of [["POST", "/api/leads"], ["GET", "/api/leads"], ["POST", "/api/content"]]) {
      expect(await validateAppKey(req(m, p))).toBeNull();
    }
  });
  it("an inactive key is refused", async () => {
    rec(null, false);
    expect(await validateAppKey(req("GET", "/api/leads"))).toBeNull();
  });
  it("a refused scope does not touch lastUsedAt; an allowed one does", async () => {
    rec("read");
    await validateAppKey(req("POST", "/api/leads"));
    expect(upd).not.toHaveBeenCalled();
    await validateAppKey(req("GET", "/api/leads"));
    expect(upd).toHaveBeenCalledTimes(1);
  });
});
