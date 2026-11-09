// Offers generated from a lead (raw60 D12/D18, Péter + Áron 2026-11-09). PURE
// module, no DB: templates, the tenant config shape with its defaults, and the
// builder that turns (template, config, inputs) into quote lines + frozen meta.
// An offer is stored as a Quote (template + meta + line items); the PDF is
// rendered from that row (lib/offers/pdf.tsx), so it never changes after the fact.
//
// Prices come ONLY from config. A missing value is a PLACEHOLDER line (unitRate
// null): it renders as "[egyeztetés alatt]" and blocks sending (hasPlaceholders).
// Nothing here invents a price. All Hungarian text is PROPOSAL until Áron approves.

export const OFFER_TEMPLATES = ["demo", "big_service", "rental", "purchase"] as const;
export type OfferTemplate = (typeof OFFER_TEMPLATES)[number];
export const isOfferTemplate = (s: unknown): s is OfferTemplate => (OFFER_TEMPLATES as readonly unknown[]).includes(s);

export const OFFER_TEMPLATE_LABEL: Record<OfferTemplate, string> = {
  demo: "Bevezető vizsgálat (demó)",
  big_service: "Nagyobb vizsgálat (Standard / Unlimited)",
  rental: "Eszközbérlés",
  purchase: "Eszközvásárlás",
};

/** The W2 offer_type each template qualifies the lead with. */
export const OFFER_TYPE_BY_TEMPLATE: Record<OfferTemplate, "service" | "rental" | "purchase"> = {
  demo: "service", big_service: "service", rental: "rental", purchase: "purchase",
};

export const PLACEHOLDER = "[egyeztetés alatt]";
const HUF = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 });

/** tenants.settings.offers. Every field optional; null/missing = placeholder. */
export interface OfferConfig {
  issuer: {
    legalName: string | null;   // Uphill Trade Kft. (tenants.settings.offers.issuer)
    brand: string | null;       // BetonRadar
    website: string | null;     // betonradar.hu
    address: string | null;
    taxNumber: string | null;
    companyRegNo: string | null;
    email: string | null;
    phone: string | null;
    bankAccount: string | null;
  };
  vatRate: number;
  validityDays: number;
  demo: { netHuf: number | null; areaM2: number; hours: number; introPeriodText: string; creditRuleText: string | null };
  bigService: {
    standardPerM2Huf: number | null;  // Standard package (6 h/day cap)
    unlimitedPerM2Huf: number | null; // Unlimited package (12 h/day cap)
    calloutHuf: number | null;        // kiszállási díj
  };
  rental: { monthlyNetHuf: number | null };
  purchase: { netHuf: number | null };
}

/** The demo-credit rule (Kai / Áron 2026-11-09). PROPOSAL copy. */
export const DEMO_CREDIT_RULE_TEXT =
  "A bemutató mérés díját (100 000 Ft + ÁFA) jóváírjuk, ha a bemutatót követő 2 héten belül legalább 100 m² mérést (ennek megfelelő, legalább 300 000 Ft + ÁFA értékű szolgáltatást), gépbérlést vagy gépvásárlást rendel.";

/**
 * Defaults when a tenant has no `offers` settings. The issuer's legal facts are
 * NEVER defaulted in code: they live in tenants.settings.offers (seeded for
 * tenant 1 from COMPANY.md), so a missing value shows as a placeholder.
 */
export const DEFAULT_OFFER_CONFIG: OfferConfig = {
  issuer: {
    legalName: null, brand: null, website: null,
    address: null, taxNumber: null, companyRegNo: null, email: null, phone: null, bankAccount: null,
  },
  vatRate: 27,
  validityDays: 30,
  demo: { netHuf: 100_000, areaM2: 5, hours: 1, introPeriodText: "a következő két hónapban", creditRuleText: DEMO_CREDIT_RULE_TEXT },
  // shortcut: Pricing_Model says Unlimited 3000 Ft/m2 but marks the numbers as partly placeholder; left null until Péter confirms.
  bigService: { standardPerM2Huf: null, unlimitedPerM2Huf: null, calloutHuf: null },
  rental: { monthlyNetHuf: null },
  purchase: { netHuf: null },
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Read tenants.settings.offers over the defaults; malformed values fall back field by field. */
export function offerConfigFromSettings(settings: unknown): OfferConfig {
  const raw = ((settings ?? {}) as { offers?: Record<string, unknown> }).offers ?? {};
  const d = DEFAULT_OFFER_CONFIG;
  const sec = (k: string) => ((raw as Record<string, unknown>)[k] ?? {}) as Record<string, unknown>;
  const iss = sec("issuer"), demo = sec("demo"), big = sec("bigService"), rent = sec("rental"), buy = sec("purchase");
  const pick = <T>(v: T | null, dv: T): T => (v ?? dv);
  return {
    issuer: {
      legalName: str(iss.legalName) ?? d.issuer.legalName,
      brand: str(iss.brand) ?? d.issuer.brand,
      website: str(iss.website) ?? d.issuer.website,
      address: str(iss.address), taxNumber: str(iss.taxNumber), companyRegNo: str(iss.companyRegNo),
      email: str(iss.email), phone: str(iss.phone), bankAccount: str(iss.bankAccount),
    },
    vatRate: pick(num((raw as Record<string, unknown>).vatRate), d.vatRate),
    validityDays: pick(num((raw as Record<string, unknown>).validityDays), d.validityDays),
    demo: {
      netHuf: "netHuf" in demo ? num(demo.netHuf) : d.demo.netHuf,
      areaM2: pick(num(demo.areaM2), d.demo.areaM2),
      hours: pick(num(demo.hours), d.demo.hours),
      introPeriodText: str(demo.introPeriodText) ?? d.demo.introPeriodText,
      creditRuleText: "creditRuleText" in demo ? str(demo.creditRuleText) : d.demo.creditRuleText,
    },
    bigService: {
      standardPerM2Huf: num(big.standardPerM2Huf),
      unlimitedPerM2Huf: num(big.unlimitedPerM2Huf),
      calloutHuf: num(big.calloutHuf),
    },
    rental: { monthlyNetHuf: num(rent.monthlyNetHuf) },
    purchase: { netHuf: num(buy.netHuf) },
  };
}

export interface OfferInput {
  template: OfferTemplate;
  /** big_service: the declared area in m2 (required there). */
  areaM2?: number | null;
  /** big_service: which package. */
  bigPackage?: "standard" | "unlimited";
  /** rental: months. */
  months?: number | null;
}

export interface OfferLine {
  description: string;
  quantity: number | null;
  unit: string | null;
  /** null = placeholder price. */
  unitRate: number | null;
  /** quantity * unitRate, null when either is unknown. */
  amount: number | null;
}

/** Frozen on quotes.meta; the PDF reads ONLY this + the lines + the quote row. */
export interface OfferMeta {
  template: OfferTemplate;
  issuer: OfferConfig["issuer"];
  /** Paragraphs shown above the price table. */
  intro: string[];
  /** Paragraphs shown below the totals (terms, acceptance). */
  terms: string[];
  acceptance: string;
  validityDays: number;
}

export interface BuiltOffer {
  title: string;
  vatRate: number;
  lines: OfferLine[];
  meta: OfferMeta;
  hasPlaceholders: boolean;
}

export const ACCEPTANCE_TEXT = "Elfogadás: válaszoljon erre az e-mailre ezzel a szóval: Elfogadom";

const line = (description: string, quantity: number | null, unit: string | null, unitRate: number | null): OfferLine => ({
  description, quantity, unit, unitRate,
  amount: quantity != null && unitRate != null ? Math.round(quantity * unitRate) : null,
});

/** Pure: the offer for a template, or an error for missing required input. */
export function buildOffer(input: OfferInput, cfg: OfferConfig): BuiltOffer | { error: string } {
  const base = { issuer: cfg.issuer, acceptance: ACCEPTANCE_TEXT, validityDays: cfg.validityDays, template: input.template };
  const common = [
    "Az árak nettó árak, az ÁFA külön kerül felszámításra.",
    "A munkát a megrendelés után telefonon egyeztetett időpontban végezzük; a számlát a munka után állítjuk ki.",
  ];
  let title: string, lines: OfferLine[], intro: string[], terms: string[];
  switch (input.template) {
    case "demo":
      title = "Bevezető betonvizsgálat";
      lines = [line(`Bevezető vizsgálat: legfeljebb ${cfg.demo.hours} óra, legfeljebb ${cfg.demo.areaM2} m², a helyszínen`, 1, "alkalom", cfg.demo.netHuf)];
      intro = [
        `Bevezető vizsgálatunkkal ${cfg.demo.hours} óra alatt legfeljebb ${cfg.demo.areaM2} m² felületet vizsgálunk meg a helyszínen.`,
        // Áron 2026-11-09: one price, invoiced after the work (no prepay ladder).
        `Bevezető ár ${cfg.demo.introPeriodText}: ${cfg.demo.netHuf != null ? `${HUF.format(cfg.demo.netHuf)} Ft` : PLACEHOLDER} + ÁFA. Számlázás a munka elvégzése után.`,
      ];
      terms = [common[0], ...(cfg.demo.creditRuleText ? [cfg.demo.creditRuleText] : [])];
      break;
    case "big_service": {
      const area = input.areaM2 ?? null;
      if (area == null || !(area > 0)) return { error: "Nagyobb vizsgálathoz a terület (m²) kötelező" };
      const pkg = input.bigPackage ?? "standard";
      const rate = pkg === "unlimited" ? cfg.bigService.unlimitedPerM2Huf : cfg.bigService.standardPerM2Huf;
      title = pkg === "unlimited" ? "Betonvizsgálat, Unlimited csomag" : "Betonvizsgálat, Standard csomag";
      lines = [
        line(`Vizsgálat, ${pkg === "unlimited" ? "Unlimited (napi legfeljebb 12 óra)" : "Standard (napi legfeljebb 6 óra)"} csomag`, area, "m²", rate),
        line("Kiszállás", 1, "alkalom", cfg.bigService.calloutHuf),
      ];
      intro = [`A megadott terület: ${area} m². A csomag napi óraszámkerete naponta értendő.`];
      terms = common;
      break;
    }
    case "rental": {
      const months = input.months && input.months > 0 ? input.months : 1;
      title = "Eszközbérlési ajánlat";
      lines = [line("Betonvizsgáló eszköz bérlése", months, "hónap", cfg.rental.monthlyNetHuf)];
      intro = ["Az eszköz bérlésének pontos feltételeit a szerződés tartalmazza."];
      terms = ["Az árak nettó árak, az ÁFA külön kerül felszámításra."];
      break;
    }
    case "purchase":
      title = "Eszközvásárlási ajánlat";
      lines = [line("Betonvizsgáló eszköz", 1, "db", cfg.purchase.netHuf)];
      intro = ["Az eszköz pontos konfigurációját és szállítási feltételeit a szerződés tartalmazza."];
      terms = ["Az árak nettó árak, az ÁFA külön kerül felszámításra."];
      break;
  }
  const hasPlaceholders = lines.some((l) => l.unitRate == null) || issuerMissing(cfg.issuer).length > 0;
  return { title, vatRate: cfg.vatRate, lines, meta: { ...base, intro, terms }, hasPlaceholders };
}

/** Issuer facts the PDF prints as mandatory; any missing one blocks sending (one check, used by build and send). */
export function issuerMissing(issuer: OfferConfig["issuer"]): string[] {
  const req: (keyof OfferConfig["issuer"])[] = ["legalName", "brand", "address", "taxNumber", "companyRegNo"];
  return req.filter((k) => !issuer[k]);
}

/** Totals over known amounts; `complete` false when any line is a placeholder. */
export function offerTotals(lines: Pick<OfferLine, "amount">[], vatRate: number) {
  const net = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const vat = Math.round((net * vatRate) / 100);
  return { net, vat, gross: net + vat, complete: lines.every((l) => l.amount != null) };
}

/** Everything the offer PDF renders (lib/offers/pdf.tsx). Built by service.loadOfferPdfDoc. */
export interface OfferPdfDoc {
  quoteNumber: string;
  title: string;
  createdAt: Date;
  validUntil: Date | null;
  currency: string;
  vatRate: number;
  totals: { net: number; vat: number; gross: number; complete: boolean };
  customer: { company: string | null; contactName: string | null; email: string | null; phone: string | null };
  lines: OfferLine[];
  meta: OfferMeta;
}
