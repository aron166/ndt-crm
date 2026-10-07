import { describe, it, expect, vi } from "vitest";
import { createGithubIssue, newIssueUrl } from "./ticket";

const valid = { title: "Hibás gomb", body: "Nem működik a gomb az oldalon.", label: "bug", repo: "ndt-crm" };
const draft = valid as Parameters<typeof newIssueUrl>[0];

describe("createGithubIssue", () => {
  it("returns html_url on success", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ html_url: "https://github.com/aron166/ndt-crm/issues/9" }), { status: 201 }));
    expect(await createGithubIssue(draft, { token: "t", fetchImpl: f })).toEqual({ ok: true, url: "https://github.com/aron166/ndt-crm/issues/9" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/aron166/ndt-crm/issues");
    expect(JSON.parse(init.body)).toEqual({ title: valid.title, body: valid.body, labels: ["bug"] });
  });
  it("403 and network errors fall back", async () => {
    const f403 = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    expect(await createGithubIssue(draft, { token: "t", fetchImpl: f403 })).toEqual({ ok: false, fallbackUrl: newIssueUrl(draft) });
    const fnet = vi.fn().mockRejectedValue(new Error("down"));
    expect((await createGithubIssue(draft, { token: "t", fetchImpl: fnet })).ok).toBe(false);
  });
  it("no token falls back without fetching", async () => {
    const f = vi.fn();
    vi.stubEnv("ASSISTANT_GITHUB_TOKEN", "");
    expect((await createGithubIssue(draft, { fetchImpl: f })).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("fallback url has the issue-new shape", () => {
    expect(newIssueUrl(draft)).toMatch(/^https:\/\/github\.com\/aron166\/ndt-crm\/issues\/new\?title=.*&body=.*&labels=bug$/);
  });
});
