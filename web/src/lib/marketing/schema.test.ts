import { describe, it, expect } from "vitest";
import { contentIntakeSchema, resolveCampaignSlug, defaultCategory } from "./schema";

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

describe("defaultCategory", () => {
  it("derives email from content_type=email", () => {
    expect(defaultCategory("email")).toBe("email");
  });
  it("derives video from content_type=video_script", () => {
    expect(defaultCategory("video_script")).toBe("video");
  });
  it("falls back to other for post/article", () => {
    expect(defaultCategory("post")).toBe("other");
    expect(defaultCategory("article")).toBe("other");
  });
});

describe("contentIntakeSchema — content approval fields", () => {
  it("accepts the new optional wire fields", () => {
    const r = contentIntakeSchema.safeParse({
      ...valid,
      category: "landing",
      format: "9x16_video",
      purpose: "Q4 cold email, step 1",
      external_ref: "growth/campaigns/cold-email-v0/drafts/a.md#touch-1",
      change_note: "fixed the CTA",
      import: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBe("landing");
      expect(r.data.import).toBe(true);
    }
  });

  it("rejects an unknown category", () => {
    expect(contentIntakeSchema.safeParse({ ...valid, category: "tiktok_reel" }).success).toBe(false);
  });

  it("category is optional (route derives the default)", () => {
    const r = contentIntakeSchema.safeParse(valid);
    expect(r.success && r.data.category).toBeUndefined();
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
