import { describe, it, expect } from "vitest";
import { renderBody, withUtm, type RenderContext } from "./render";

const ctx: RenderContext = {
  templateKey: "svc-1",
  position: 2,
  trackUrl: (d) => `https://crm.test/click?u=${encodeURIComponent(d)}`,
  unsubscribeUrl: "https://crm.test/unsub?d=x&s=y",
  issuer: { legalName: "Beton Kft.", brand: "BetonRadar", address: "Budapest", website: "https://www.betonradar.hu" },
};

describe("withUtm", () => {
  it("tags betonradar.hu and subdomains", () => {
    for (const u of ["https://betonradar.hu/a", "https://www.betonradar.hu/a"]) {
      const p = new URL(withUtm(u, "k", 3)).searchParams;
      expect(p.get("utm_source")).toBe("nurture");
      expect(p.get("utm_medium")).toBe("email");
      expect(p.get("utm_campaign")).toBe("k");
      expect(p.get("utm_content")).toBe("step-3");
    }
  });
  it("keeps other links and junk as is", () => {
    expect(withUtm("https://example.com/a", "k", 1)).toBe("https://example.com/a");
    expect(withUtm("https://evilbetonradar.hu/a", "k", 1)).toBe("https://evilbetonradar.hu/a");
    expect(withUtm("not a url", "k", 1)).toBe("not a url");
  });
});

describe("renderBody", () => {
  it("turns links into tracked UTM links", () => {
    const { html, text } = renderBody("Nézze: [oldal](https://www.betonradar.hu/x)", ctx);
    const m = /href="([^"]+)"/.exec(html)!;
    const dest = new URL(m[1].replace(/&amp;/g, "&")).searchParams.get("u")!;
    const p = new URL(dest).searchParams;
    expect(p.get("utm_campaign")).toBe("svc-1");
    expect(p.get("utm_content")).toBe("step-2");
    expect(html).toContain(">oldal</a>");
    expect(text).toContain("oldal: https://crm.test/click?u=");
  });
  it("escapes HTML in the body", () => {
    const { html } = renderBody("<script>alert(1)</script>", ctx);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("renders a table", () => {
    const { html, text } = renderBody("| A | B |\n|---|---|\n| 1 | 2 |", ctx);
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain(">1</td>");
    expect(text).toContain("A | B");
    expect(text).toContain("1 | 2");
  });
  it("footer has unsubscribe URL and issuer", () => {
    const { html, text } = renderBody("Szia", ctx);
    for (const out of [html, text]) {
      expect(out).toContain("https://crm.test/unsub?d=x&");
      expect(out).toContain("Beton Kft.");
    }
  });
  it("text part has no HTML tags", () => {
    const { text } = renderBody("**Bold** [a](https://www.betonradar.hu)\n\n| A |\n|---|\n| 1 |", ctx);
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).toContain("Bold");
  });
});
