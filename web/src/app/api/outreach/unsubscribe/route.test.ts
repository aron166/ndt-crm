import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyOptOut } from "@/lib/outreach/unsubscribe";
import { signPayload } from "@/lib/outreach/token";
import { reportError } from "@/lib/report-error";
import { GET, POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/outreach/unsubscribe", () => ({ applyOptOut: vi.fn() }));

const apply = applyOptOut as unknown as ReturnType<typeof vi.fn>;
const KEY = "ab".repeat(32);
const url = (d?: string, s?: string) => {
  const u = new URL("https://x.test/api/outreach/unsubscribe");
  if (d != null) u.searchParams.set("d", d);
  if (s != null) u.searchParams.set("s", s);
  return u.toString();
};
const good = (t = 1) => { const { d, s } = signPayload("unsub", { t, e: "a@b.hu", r: 5 }); return url(d, s); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", KEY);
  apply.mockResolvedValue({ suppressed: true, memberUpdated: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET", () => {
  it("valid token: 200 with a POST form, no write", async () => {
    const res = await GET(new Request(good()));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await res.text()).toContain('method="post"');
    expect(apply).not.toHaveBeenCalled();
  });
  it("bad token: 400", async () => {
    const res = await GET(new Request(url("abc", "def")));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("A link érvénytelen vagy lejárt.");
  });
  it("missing d or s: 400", async () => {
    expect((await GET(new Request(url()))).status).toBe(400);
    expect((await GET(new Request(url("abc")))).status).toBe(400);
  });
});

describe("POST", () => {
  it("valid: 200 and applyOptOut once with the token's data", async () => {
    const res = await POST(new Request(good(), { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(res.status).toBe(200);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(1, "a@b.hu", { kind: "unsubscribe", source: "unsubscribe_link", draftId: 5, agent: "unsubscribe" });
  });
  it("token for tenant 2 acts on tenant 2", async () => {
    await POST(new Request(good(2), { method: "POST" }));
    expect(apply.mock.calls[0][0]).toBe(2);
  });
  it("twice: same 200 body", async () => {
    const u = good();
    const a = await POST(new Request(u, { method: "POST" }));
    apply.mockResolvedValue({ suppressed: true, memberUpdated: false });
    const b = await POST(new Request(u, { method: "POST" }));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await b.text()).toBe(await a.text());
  });
  it("bad or missing token: 400, no write", async () => {
    expect((await POST(new Request(url("abc", "def"), { method: "POST" }))).status).toBe(400);
    expect((await POST(new Request(url(), { method: "POST" }))).status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });
  it("applyOptOut throws: 500 and reported", async () => {
    apply.mockRejectedValue(new Error("db"));
    const res = await POST(new Request(good(), { method: "POST" }));
    expect(res.status).toBe(500);
    expect(reportError).toHaveBeenCalled();
  });
});
