import { describe, it, expect } from "vitest";
import { runContentRules, CONTENT_RULES, BODY_MAX_CHARS_EMAIL, type RuleContext } from "./rules";

function ctx(overrides: Partial<RuleContext>): RuleContext {
  return { category: "email", body: "", ...overrides };
}

function violationRules(c: RuleContext): string[] {
  return runContentRules(c).map((v) => v.rule);
}

describe("CONTENT_RULES table: one violating + one clean input per rule", () => {
  it("forbidden_price", () => {
    expect(violationRules(ctx({ body: "Az ár 500 000 Ft, keresse meg árajánlatért." }))).toContain(
      "forbidden_price",
    );
    expect(
      violationRules(
        ctx({ body: "Roncsolásmentes betonvizsgálattal foglalkozunk, egyoldali hozzáféréssel, sugárzás nélkül." }),
      ),
    ).not.toContain("forbidden_price");
  });

  it("forbidden_depth", () => {
    expect(violationRules(ctx({ body: "A betonvas 80 cm mélyen fut a szerkezetben." }))).toContain(
      "forbidden_depth",
    );
    expect(violationRules(ctx({ body: "Milliméteres pontossággal mérjük a betonvas helyzetét." }))).not.toContain(
      "forbidden_depth",
    );
  });

  it("forbidden_report_time", () => {
    expect(violationRules(ctx({ body: "A riportot 72 órán belül megkapja." }))).toContain(
      "forbidden_report_time",
    );
    expect(
      violationRules(ctx({ body: "A mérés eredménye a helyszínen valós időben elérhető." })),
    ).not.toContain("forbidden_report_time");
  });

  it("forbidden_throughput", () => {
    expect(violationRules(ctx({ body: "Akár 500 m²/óra sebességgel dolgozunk." }))).toContain(
      "forbidden_throughput",
    );
    expect(
      violationRules(ctx({ body: "600 m² födémet mértünk fel két óra alatt, megbontás nélkül." })),
    ).not.toContain("forbidden_throughput");
  });

  it("forbidden_tolerance", () => {
    expect(violationRules(ctx({ body: "A mérés pontossága ±1 mm." }))).toContain("forbidden_tolerance");
    expect(violationRules(ctx({ body: "A mérés milliméteres pontosságú." }))).not.toContain(
      "forbidden_tolerance",
    );
  });

  it("forbidden_xray", () => {
    expect(violationRules(ctx({ body: "Röntgennel vizsgáljuk a betonszerkezetet." }))).toContain(
      "forbidden_xray",
    );
    expect(
      violationRules(ctx({ body: "Nincs röntgen, nincs sugárzás, egyoldali hozzáféréssel dolgozunk." })),
    ).not.toContain("forbidden_xray");
  });

  it("forbidden_reference", () => {
    expect(violationRules(ctx({ body: "Vasúti referenciáink között szerepel a 100c vonal." }))).toContain(
      "forbidden_reference",
    );
    expect(
      violationRules(ctx({ body: "Norvég technológiai partnerünk a bergeni GC Rieber épületen dolgozott." })),
    ).not.toContain("forbidden_reference");
  });

  it("unfilled_placeholder", () => {
    expect(violationRules(ctx({ body: "Bővebben itt: <LEAD_MAGNET_URL>." }))).toContain(
      "unfilled_placeholder",
    );
    expect(violationRules(ctx({ body: "Bővebben itt: https://uphilltrade.hu/georadar." }))).not.toContain(
      "unfilled_placeholder",
    );
  });

  it("missing_footer", () => {
    expect(
      violationRules(
        ctx({ body: "Üdvözlettel,\nBalogh Áron", requiresFooter: true, footer: "Leiratkozás: ..." }),
      ),
    ).toContain("missing_footer");
    expect(
      violationRules(
        ctx({
          body: "Üdvözlettel,\nBalogh Áron\n\n-- \nLeiratkozás: ...",
          requiresFooter: true,
          footer: "Leiratkozás: ...",
        }),
      ),
    ).not.toContain("missing_footer");
  });

  it("missing_footer does not fire when no footer is configured (unfixable otherwise)", () => {
    expect(
      violationRules(ctx({ body: "Üdvözlettel,\nBalogh Áron", requiresFooter: true, footer: null })),
    ).not.toContain("missing_footer");
  });

  it("body_too_long", () => {
    expect(violationRules(ctx({ body: "x".repeat(BODY_MAX_CHARS_EMAIL + 1) }))).toContain("body_too_long");
    expect(violationRules(ctx({ body: "x".repeat(BODY_MAX_CHARS_EMAIL - 1) }))).not.toContain(
      "body_too_long",
    );
  });

  it("no_personal_hook", () => {
    expect(
      violationRules(ctx({ body: "Szeretnénk bemutatkozni, mert úgy gondoljuk, hasznos lehet Önöknek." })),
    ).toContain("no_personal_hook");
    expect(violationRules(ctx({ body: "2020-ban a Millér-patak hídjának szerkezetét vizsgáltuk." }))).not.toContain(
      "no_personal_hook",
    );
  });

  it("unverified_recipient", () => {
    expect(violationRules(ctx({ body: "Tisztelt Cím!", recipientVerified: false }))).toContain(
      "unverified_recipient",
    );
    expect(violationRules(ctx({ body: "Tisztelt Cím!", recipientVerified: true }))).not.toContain(
      "unverified_recipient",
    );
  });

  it("duplicate_hook", () => {
    const hook = "A B-pier bővítése és a check-in csarnok átalakítása olyan betonszerkezetekbe vág bele.";
    expect(violationRules(ctx({ body: hook, otherHooks: [hook] }))).toContain("duplicate_hook");
    expect(
      violationRules(ctx({ body: hook, otherHooks: ["Teljesen más nyitás egy másik cégnek, más ténnyel."] })),
    ).not.toContain("duplicate_hook");
  });

  it("forbidden_price: a bare price word with no number nearby passes", () => {
    expect(violationRules(ctx({ body: "Az árajánlat elküldése után jelentkezünk." }))).not.toContain(
      "forbidden_price",
    );
  });

  it("forbidden_price: a price word with a number nearby fires", () => {
    expect(violationRules(ctx({ body: "Az árajánlatunk 120 000 Ft." }))).toContain("forbidden_price");
    expect(violationRules(ctx({ body: "A díj 5%." }))).toContain("forbidden_price");
  });

  it("claim rules never fire on internal items, even with a blatant claim", () => {
    const body = "Az ár 500 000 Ft. Röntgennel dolgozunk.";
    expect(violationRules(ctx({ body, internal: true }))).toEqual([]);
  });

  it("claim rules never fire on process_doc format, even with a blatant claim", () => {
    const body = "Az ár 500 000 Ft. Röntgennel dolgozunk.";
    // category: "script" (not "email") so the email-only rules (no_personal_hook
    // etc.) stay out of this claim-rules-only assertion.
    expect(violationRules(ctx({ body, category: "script", format: "process_doc" }))).toEqual([]);
  });

  it("every rule id is covered above", () => {
    const ids = CONTENT_RULES.map((r) => r.id).sort();
    expect(ids).toEqual(
      [
        "forbidden_price",
        "forbidden_depth",
        "forbidden_report_time",
        "forbidden_throughput",
        "forbidden_tolerance",
        "forbidden_xray",
        "forbidden_reference",
        "unfilled_placeholder",
        "missing_footer",
        "body_too_long",
        "no_personal_hook",
        "unverified_recipient",
        "duplicate_hook",
      ].sort(),
    );
  });
});

// Regression: real touch bodies pasted verbatim from
// growth/campaigns/cold-email-v0/drafts/*.md (Tisztelt … Üdvözlettel span,
// signature omitted). If a rule fires here, the rule is too aggressive —
// fix the rule, not this block. Only a-hid touch 4 is expected to violate
// (unfilled_placeholder, from the pasted-in <LEAD_MAGNET_URL>/<LANDING_URL>).

const A_HID_TOUCH_1 = `Tisztelt Tóth Úr!

2020-ban a Millér-patak hídjának acélszerkezetét vizsgáltuk Önöknek, 2021-ben pedig a Lánchíd-munkán dolgoztunk együtt.

Most egy új mérési képesség miatt keresem: ez nem a korábbi acélszerkezet-vizsgálat folytatása, hanem betonvizsgálat, más műszerrel és más kérdésre. Georadarral és lézeres letapogatással megmutatjuk, hol fut a betonvas a meglévő szerkezetben, mekkora a betontakarás és mekkora az átmérő — bontás és sugárzás nélkül, egyoldali hozzáféréssel.

Van most olyan műtárgyuk, ahol a meglévő vaskiosztásról nincs meg a megvalósulási terv?`;

const A_HID_TOUCH_2 = `Tisztelt Tóth Úr!

Nem küldök hosszú anyagot. Megér tíz percet telefonon?

Csak azt szeretném megérteni, hogy Önöknél ma hol kerül elő a fúrás és a bontás előtti szerkezetfelmérés kérdése, és van-e egyáltalán értelme visszatérnem rá.

Kedden 9 és 10 között, vagy csütörtökön 15 és 16 között tudok telefonálni. Melyik a jobb?`;

const A_HID_TOUCH_3 = `Tisztelt Tóth Úr!

Egy szám, amiért érdemes lehet visszatérni rá: norvég technológiai partnerünk a bergeni GC Rieber épületen 600 m² födémet mért fel két óra alatt, a szerkezet megbontása nélkül.

Amit a mérésből kap: pontfelhő, hőtérképszerű 2D betonvas-kép, 3D modell és mérési jegyzőkönyv, milliméteres pontossággal.

Van most olyan helyszínük, ahol meglévő teherhordó szerkezetbe kell áttörést vagy lehorgonyzást készíteni?`;

const A_HID_TOUCH_4 = `Tisztelt Tóth Úr!

Nem húzom tovább — ha most nem aktuális, teljesen rendben.

Itt hagyom a rövid szakmai összefoglalót arról, mit lát a georadar a betonban és mit nem: <LEAD_MAGNET_URL>. Ha később előkerül egy fúrás vagy egy állapotfelmérés, elég egy sor.

<LANDING_URL>`;

const BETONSZABO_TOUCH_1 = `Tisztelt Tóth Úr!

Az oldalukon az áll, hogy a szerszámaik az acélbetétet is elforgácsolják, ezért az áttörés helye nem függ a betonvas helyzetétől — kivéve a statikai szempontokat. A gyakorlatban ez a kivétel kerül a legtöbbe: teherhordó szerkezetnél azt kell tudni, hol nem szabad átvágni.

Roncsolásmentes betonvizsgálattal foglalkozunk: a vágás előtt megmutatjuk, hol fut a betonvas, milyen mélyen és milyen átmérővel — egyoldali hozzáféréssel, bontás és sugárzás nélkül, ugyanazon a munkanapon.

Előfordul, hogy a beton vasaltsága miatt kell felárral árazniuk?`;

const BETONSZABO_TOUCH_2 = `Tisztelt Tóth Úr!

Egy szám, amiért érdemes lehet válaszolni: norvég technológiai partnerünk a bergeni GC Rieber épületen 600 m² födémet mért fel két óra alatt, a szerkezet megbontása nélkül. Ez nem lassítja a brigádot, hanem megelőzi.

Van olyan munkájuk, ahol ajánlatadás előtt a vaskiosztás sűrűsége a nyitott kérdés?`;

const MVM_TOUCH_1 = `Tisztelt Beruházási Műszaki Vezető!

A tiszaújvárosi CCGT kiviteli tervei idén készülnek el, az építés az év végén válik láthatóvá — a talajmechanikai feltárás megvan, a meglévő beton belseje viszont dokumentálatlan.

Roncsolásmentes betonvizsgálattal foglalkozunk: georadarral és lézeres letapogatással megmutatjuk, hol fut a betonvas a meglévő szerkezetben, mekkora a betontakarás és milyen az átmérő — bontás és sugárzás nélkül, egyoldali hozzáféréssel.

Van most olyan meglévő alapjuk vagy tartószerkezetük, aminek a vaskiosztásáról nincs meg a megvalósulási terv?`;

const MVM_TOUCH_2 = `Tisztelt Beruházási Műszaki Vezető!

Egy szám, amiért érdemes lehet válaszolni: norvég technológiai partnerünk a bergeni GC Rieber épületen 600 m² födémet mért fel két óra alatt, a szerkezet megbontása nélkül.

Üzemelő erőműben ennek a mérésnek külön súlya van: nincs sugárzás, tehát nincs lezárt terület, nincs kiürítés és nincs ellenőrzött zóna. A műszak mellette dolgozhat, és egyoldali hozzáférés elég.

Van most olyan meglévő szerkezetük, amibe az új blokk rácsatlakozásánál fúrni vagy dűbelezni kell?`;

describe("regression: real cold-email-v0 touches stay clean", () => {
  const clean: Array<[string, string]> = [
    ["A-Híd touch 1", A_HID_TOUCH_1],
    ["A-Híd touch 2", A_HID_TOUCH_2],
    ["A-Híd touch 3", A_HID_TOUCH_3],
    ["Betonszabó touch 1", BETONSZABO_TOUCH_1],
    ["Betonszabó touch 2", BETONSZABO_TOUCH_2],
    ["MVM touch 1", MVM_TOUCH_1],
    ["MVM touch 2", MVM_TOUCH_2],
  ];

  it.each(clean)("%s has no rule violations", (_name, body) => {
    expect(violationRules(ctx({ body }))).toEqual([]);
  });

  it("A-Híd touch 4 violates only unfilled_placeholder (the pasted-in <LEAD_MAGNET_URL>/<LANDING_URL>)", () => {
    expect(violationRules(ctx({ body: A_HID_TOUCH_4 }))).toEqual(["unfilled_placeholder"]);
  });
});
