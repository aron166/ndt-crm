import { describe, it, expect } from "vitest";
import { greetingFor, pickAsset, renderEmail, renderedText, segmentOf, variantTag, OPENER, type MergeValues } from "./email-preview";

const V: MergeValues = {
  company: "Példa Építő Kft.", contactName: "Kovács Anna", city: "Győr", segment: "A",
  senderName: "Balogh Áron", senderPhone: "+36 30 000 0000", whyNow: null, tripDate: "november 25.", tripCity: "Székesfehérvár",
};
const text = (r: ReturnType<typeof renderEmail>) => renderedText(r.body);

describe("renderEmail: every merge field", () => {
  it("fills company, contact name, city, segment wording, sender, phone and the trip fields", () => {
    const r = renderEmail({ subject: "Ajánlat: {{company}}", body: "{{greeting}}\n{{contact_name}} | {{company}} | {{city}} | {{segment}} | {{sender_name}} {{sender_phone}} | {{trip_date}} {{trip_city}}" }, V);
    expect(r.missing).toEqual([]);
    expect(renderedText(r.subject)).toBe("Ajánlat: Példa Építő Kft.");
    expect(text(r)).toBe("Tisztelt Kovács Anna!\nKovács Anna | Példa Építő Kft. | Győr | generálkivitelezők, felújítók | Balogh Áron +36 30 000 0000 | november 25. Székesfehérvár");
  });

  it("shows and counts every unresolved field instead of a blank, and never yields draft text", () => {
    const r = renderEmail({ subject: "{{company}}", body: "{{sender_phone}} {{trip_city}} {{sender_phone}} {{nonsense}}" }, { ...V, senderPhone: null, tripCity: "  ", company: null });
    expect(r.missing).toEqual(["company", "sender_phone", "trip_city", "nonsense"]);
    expect(r.body.filter((p) => "missing" in p)).toHaveLength(4);
    expect(renderedText(r.body)).toBeNull();
  });

  it("drops the why_now opener when no checked fact exists, and notes it", () => {
    const r = renderEmail({ subject: "s", body: `Balogh Áron vagyok, a BetonRadartól. ${OPENER}\n\nTovább.` }, V);
    expect(text(r)).toBe("Balogh Áron vagyok, a BetonRadartól.\n\nTovább.");
    expect(r.notes).toHaveLength(1);
    expect(r.missing).toEqual([]);
    const w = renderEmail({ subject: "s", body: OPENER }, { ...V, whyNow: "a cég most újít fel egy irodaházat" });
    expect(text(w)).toBe("Azért írok Önnek, mert a cég most újít fel egy irodaházat.");
  });
});

describe("greeting: missing contact name fallback (PROPOSAL, the engine's rule)", () => {
  it("uses the full name only, never a guessed úr or asszony", () => {
    expect(greetingFor("Kovács Anna")).toBe("Tisztelt Kovács Anna!");
    expect(greetingFor("Kovács")).toBe("Jó napot kívánok!");
    expect(greetingFor(null)).toBe("Jó napot kívánok!");
    expect(greetingFor("- -")).toBe("Jó napot kívánok!");
    expect(renderedText(renderEmail({ subject: "", body: "{{greeting}}" }, { ...V, contactName: null }).body)).toBe("Jó napot kívánok!");
  });
});

describe("Hungarian suffix safety", () => {
  it("flags a suffix glued onto a company or city name", () => {
    expect(renderEmail({ subject: "{{city}}ban mérünk", body: "a {{company}}-nál és {{city}}-ben" }, V).suffix.sort()).toEqual(["city", "company"]);
  });
  it("accepts constructions that need no suffix", () => {
    expect(renderEmail({ subject: "Mérés, helyszín: {{city}}", body: "Cég: {{company}}. Város: {{city}}." }, V).suffix).toEqual([]);
  });
});

describe("HTML in merge values stays data", () => {
  it("keeps markup as plain text parts (React escapes it on render)", () => {
    const r = renderEmail({ subject: "", body: "{{company}}" }, { ...V, company: "<img src=x onerror=alert(1)>" });
    expect(r.body).toEqual([{ t: "<img src=x onerror=alert(1)>" }]);
  });
});

describe("segmentOf", () => {
  it("maps the raw segment first, then a lane that names one, else unknown", () => {
    expect(segmentOf({ segment: "drillers", lane: "warm network (Péter phones)" })).toBe("D");
    expect(segmentOf({ segment: "S2_asset_operator" })).toBe("C");
    expect(segmentOf({ segment: "Ready-mix" })).toBe("G");
    expect(segmentOf({ segment: null, lane: "engineer" })).toBe("B");
    expect(segmentOf({ segment: "", lane: "warm network (Péter phones)" })).toBeNull();
    expect(segmentOf({ segment: "Post-tensioning", lane: "trip fill" })).toBeNull();
  });
});

describe("pickAsset and variantTag", () => {
  const vars = [
    { itemId: 12, segment: "A" as const, status: "in_review" },
    { itemId: 11, segment: "A" as const, status: "live" },
    { itemId: 13, segment: "B" as const, status: "in_review" },
  ];
  it("prefers the segment variant (live first), then the step's own asset", () => {
    expect(pickAsset({ contentItemId: 5, contentStatus: "live" }, vars, "A")).toBe(11);
    expect(pickAsset({ contentItemId: 5, contentStatus: "live" }, vars, "C")).toBe(5);
    expect(pickAsset({ contentItemId: null }, vars, null)).toBeNull();
  });
  it("drafting uses live assets only", () => {
    expect(pickAsset({ contentItemId: null }, vars, "B", true)).toBeNull();
    expect(pickAsset({ contentItemId: 5, contentStatus: "in_review" }, vars, "B", true)).toBeNull();
    expect(pickAsset({ contentItemId: 5, contentStatus: "live" }, vars, "B", true)).toBe(5);
  });
  it("reads the tag from source_meta only when step and segment are valid", () => {
    expect(variantTag({ campaignStep: 1, segment: "D" })).toEqual({ step: 1, segment: "D" });
    expect(variantTag({ campaignStep: "1", segment: "D" })).toBeNull();
    expect(variantTag({ campaignStep: 1, segment: "H" })).toBeNull();
    expect(variantTag(null)).toBeNull();
  });
});
