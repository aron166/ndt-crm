import { describe, it, expect } from "vitest";
import {
  buildOffer, offerTotals, offerConfigFromSettings, DEFAULT_OFFER_CONFIG, OFFER_TYPE_BY_TEMPLATE, type OfferConfig, type BuiltOffer,
} from "./offer";

const filled: OfferConfig = {
  ...DEFAULT_OFFER_CONFIG,
  issuer: { ...DEFAULT_OFFER_CONFIG.issuer, legalName: "Teszt Kft.", brand: "BetonRadar", address: "1111 Budapest, Fő u. 1.", taxNumber: "12345678-1-42", companyRegNo: "01-09-000000" },
};
const ok = (r: ReturnType<typeof buildOffer>): BuiltOffer => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("buildOffer demo", () => {
  const o = ok(buildOffer({ template: "demo" }, DEFAULT_OFFER_CONFIG));
  it("uses the config price, one line, 5 m2 / 1 h", () => {
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0].unitRate).toBe(100000);
    expect(o.lines[0].amount).toBe(100000);
    expect(o.lines[0].description).toContain("5 m²");
    expect(o.lines[0].description).toContain("1 óra");
  });
  it("intro mentions the intro period, acceptance says Elfogadom", () => {
    expect(o.meta.intro.join(" ")).toContain("a következő két hónapban");
    expect(o.meta.acceptance).toContain("Elfogadom");
  });
  it("hasPlaceholders with defaults, not when issuer and price are filled", () => {
    expect(o.hasPlaceholders).toBe(true);
    expect(ok(buildOffer({ template: "demo" }, filled)).hasPlaceholders).toBe(false);
  });
});

describe("buildOffer big_service", () => {
  it("errors without area", () => {
    expect(buildOffer({ template: "big_service" }, filled)).toHaveProperty("error");
    expect(buildOffer({ template: "big_service", areaM2: 0 }, filled)).toHaveProperty("error");
  });
  it("null rates give placeholder lines and incomplete totals", () => {
    const o = ok(buildOffer({ template: "big_service", areaM2: 120 }, filled));
    expect(o.lines.every((l) => l.unitRate === null && l.amount === null)).toBe(true);
    expect(o.hasPlaceholders).toBe(true);
    expect(offerTotals(o.lines, o.vatRate).complete).toBe(false);
  });
  it("rates give amounts and 27% VAT totals", () => {
    const cfg = { ...filled, bigService: { ...filled.bigService, standardPerM2Huf: 2500, calloutHuf: 20000 } };
    const o = ok(buildOffer({ template: "big_service", areaM2: 120 }, cfg));
    expect(o.lines.map((l) => l.amount)).toEqual([300000, 20000]);
    expect(offerTotals(o.lines, 27)).toEqual({ net: 320000, vat: 86400, gross: 406400, complete: true });
    expect(o.hasPlaceholders).toBe(false);
  });
});

describe("rental and purchase", () => {
  it("never invent a price by default", () => {
    for (const template of ["rental", "purchase"] as const) {
      const o = ok(buildOffer({ template }, DEFAULT_OFFER_CONFIG));
      expect(o.lines[0].unitRate).toBeNull();
      expect(o.lines[0].amount).toBeNull();
      expect(o.hasPlaceholders).toBe(true);
    }
  });
});

describe("offerConfigFromSettings", () => {
  it("malformed values fall back to defaults", () => {
    const c = offerConfigFromSettings({ offers: { vatRate: "x", validityDays: -3, demo: { areaM2: "5", hours: NaN, introPeriodText: 7 }, issuer: { address: 5 } } });
    expect(c.vatRate).toBe(27);
    expect(c.validityDays).toBe(30);
    expect(c.demo).toEqual(DEFAULT_OFFER_CONFIG.demo);
    expect(c.issuer.address).toBeNull();
  });
  it("garbage settings give the defaults", () => {
    expect(offerConfigFromSettings(null)).toEqual(DEFAULT_OFFER_CONFIG);
    expect(offerConfigFromSettings({ offers: "nope" })).toEqual(DEFAULT_OFFER_CONFIG);
  });
  it("explicit demo.netHuf null makes a placeholder", () => {
    const c = offerConfigFromSettings({ offers: { demo: { netHuf: null } } });
    expect(c.demo.netHuf).toBeNull();
    expect(ok(buildOffer({ template: "demo" }, c)).lines[0].unitRate).toBeNull();
  });
  it("reads valid values and ignores unknown keys", () => {
    const c = offerConfigFromSettings({ offers: { vatRate: 5, mystery: 1, bigService: { standardPerM2Huf: 2500, bogus: 1 } }, other: 1 });
    expect(c.vatRate).toBe(5);
    expect(c.bigService.standardPerM2Huf).toBe(2500);
    expect(c).not.toHaveProperty("mystery");
  });
});

describe("OFFER_TYPE_BY_TEMPLATE", () => {
  it("maps templates to W2 offer types", () => {
    expect(OFFER_TYPE_BY_TEMPLATE).toEqual({ demo: "service", big_service: "service", rental: "rental", purchase: "purchase" });
  });
});

describe("config only (Kai 2026-11-09)", () => {
  it("code holds no legal issuer defaults; they come from tenants.settings.offers", () => {
    expect(DEFAULT_OFFER_CONFIG.issuer.legalName).toBeNull();
    const cfg = offerConfigFromSettings({ offers: { issuer: { legalName: "Uphill Trade Kft.", brand: "BetonRadar", website: "betonradar.hu", address: "2030 Érd, Bajuszfű utca 29.", taxNumber: "25741814-2-13" } } });
    expect(cfg.issuer).toMatchObject({ legalName: "Uphill Trade Kft.", brand: "BetonRadar", website: "betonradar.hu" });
  });
  it("the demo offer carries the demo-credit rule; an explicit null drops it", () => {
    const d = buildOffer({ template: "demo" }, DEFAULT_OFFER_CONFIG);
    expect("error" in d ? "" : d.meta.terms.join(" ")).toContain("2 héten belül legalább 100 m²");
    const none = buildOffer({ template: "demo" }, offerConfigFromSettings({ offers: { demo: { creditRuleText: null } } }));
    expect("error" in none ? "" : none.meta.terms.join(" ")).not.toContain("jóváírjuk");
  });
});

describe("demo price wording (Áron 2026-11-09)", () => {
  const demo = (cfg: OfferConfig) => ok(buildOffer({ template: "demo" }, cfg));
  it("intro states the intro price with a no-break-space separator and invoicing after the work", () => {
    expect(demo(DEFAULT_OFFER_CONFIG).meta.intro.join(" ")).toContain(
      "Bevezető ár a következő két hónapban: 100 000 Ft + ÁFA. Számlázás a munka elvégzése után.",
    );
  });
  it("terms no longer carry the generic invoice-after-work line", () => {
    expect(demo(DEFAULT_OFFER_CONFIG).meta.terms.join(" ")).not.toContain("a számlát a munka után állítjuk ki");
  });
  it("a null demo price shows the placeholder", () => {
    const cfg: OfferConfig = { ...DEFAULT_OFFER_CONFIG, demo: { ...DEFAULT_OFFER_CONFIG.demo, netHuf: null } };
    expect(demo(cfg).meta.intro.join(" ")).toContain("[egyeztetés alatt]");
  });
});
