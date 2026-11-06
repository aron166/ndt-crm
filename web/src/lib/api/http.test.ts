import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/app-key-auth", () => ({ validateAppKey: vi.fn(), rateLimit: vi.fn() }));

import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { jsonApi, requireAppKey, readJson, parseId, requireCronSecret } from "./http";

const key = { keyId: 1, tenantId: 1, appSlug: "app" };
const req = (init?: RequestInit) => new Request("https://x.test/api", init);

describe("public API edge (other apps code against these bodies and headers)", () => {
  beforeEach(() => {
    vi.mocked(validateAppKey).mockResolvedValue(key);
    vi.mocked(rateLimit).mockReturnValue(true);
  });

  it("CORS routes send the four headers on json and a 204 preflight", async () => {
    const api = jsonApi("GET, POST, OPTIONS");
    const res = api.json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
    const pre = await api.OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
  });

  it("non-CORS routes send no CORS header", () => {
    expect(jsonApi().json({}).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("401 without a valid key, 429 over the limit, the key otherwise", async () => {
    const { json } = jsonApi("POST, OPTIONS");
    vi.mocked(validateAppKey).mockResolvedValueOnce(null);
    const denied = await requireAppKey(req(), json);
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(401);
    expect(await (denied as Response).json()).toEqual({ error: "Unauthorized" });
    expect((denied as Response).headers.get("access-control-allow-origin")).toBe("*");

    vi.mocked(rateLimit).mockReturnValueOnce(false);
    const limited = (await requireAppKey(req(), json)) as Response;
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Rate limit exceeded (30 req/min)" });

    expect(await requireAppKey(req(), json)).toEqual(key);
  });

  it("readJson returns the body or a 400", async () => {
    expect(await readJson(req({ method: "POST", body: '{"a":1}' }))).toEqual({ a: 1 });
    const bad = (await readJson(req({ method: "POST", body: "{" }))) as Response;
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Invalid JSON" });
  });

  it("parseId accepts digits only", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId("4a")).toBeNull();
    expect(parseId("-1")).toBeNull();
  });

  it("cron gate: 401 unless the Bearer matches a configured secret", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(requireCronSecret(req({ headers: { authorization: "Bearer " } }))?.status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3");
    expect(requireCronSecret(req({ headers: { authorization: "Bearer s3" } }))).toBeNull();
    expect(requireCronSecret(req({ headers: { authorization: "Bearer no" } }))?.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
