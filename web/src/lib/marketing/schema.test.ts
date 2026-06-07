import { describe, it, expect } from "vitest";
import { contentIntakeSchema, resolveCampaignSlug } from "./schema";

const valid = {
  campaign_slug: "BirdsView Q3",
  channel: "linkedin_personal",
  content_type: "post",
  title: "  NDT az építőiparban  ",
  body: "A betonszkennelés jövője...",
};

describe("contentIntakeSchema", () => {
  it("accepts a minimal valid payload and trims/normalises", () => {
    const r = contentIntakeSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("NDT az építőiparban");
      expect(r.data.internal).toBe(false); // defaulted
    }
  });

  it("rejects an unknown channel", () => {
    const r = contentIntakeSchema.safeParse({ ...valid, channel: "tiktok" });
    expect(r.success).toBe(false);
  });

  it("rejects empty title or body", () => {
    expect(contentIntakeSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
    expect(contentIntakeSchema.safeParse({ ...valid, body: "" }).success).toBe(false);
  });

  it("validates asset shape and caps the count", () => {
    const ok = contentIntakeSchema.safeParse({
      ...valid,
      assets: [{ kind: "image", url: "https://x/y.png", caption: "alt" }],
    });
    expect(ok.success).toBe(true);

    const badKind = contentIntakeSchema.safeParse({
      ...valid,
      assets: [{ kind: "gif", url: "https://x/y.gif" }],
    });
    expect(badKind.success).toBe(false);

    const tooMany = contentIntakeSchema.safeParse({
      ...valid,
      assets: Array.from({ length: 21 }, () => ({ kind: "image", url: "https://x/y.png" })),
    });
    expect(tooMany.success).toBe(false);
  });

  it("carries the internal flag through", () => {
    const r = contentIntakeSchema.safeParse({ ...valid, internal: true });
    expect(r.success && r.data.internal).toBe(true);
  });

  it("does NOT coerce the string \"false\" to true for internal (safety inversion)", () => {
    const r = contentIntakeSchema.safeParse({ ...valid, internal: "false" });
    expect(r.success && r.data.internal).toBe(false);
    const r2 = contentIntakeSchema.safeParse({ ...valid, internal: "true" });
    expect(r2.success && r2.data.internal).toBe(true);
    const r3 = contentIntakeSchema.safeParse({ ...valid, internal: 0 });
    expect(r3.success && r3.data.internal).toBe(false);
  });
});

describe("resolveCampaignSlug", () => {
  it("slugifies an explicit slug (lowercase, underscores, no diacritics)", () => {
    const r = contentIntakeSchema.parse(valid);
    expect(resolveCampaignSlug(r)).toBe("birdsview_q3");
  });

  it("falls back to slugified campaign_name", () => {
    const r = contentIntakeSchema.parse({
      channel: "blog", content_type: "article", title: "x", body: "y",
      campaign_name: "Őszi Kampány 2026",
    });
    expect(resolveCampaignSlug(r)).toBe("oszi_kampany_2026");
  });

  it("returns null when neither slug nor name is given", () => {
    const r = contentIntakeSchema.parse({
      channel: "blog", content_type: "article", title: "x", body: "y",
    });
    expect(resolveCampaignSlug(r)).toBeNull();
  });
});
