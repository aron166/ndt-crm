import { formatMinutes } from "@/lib/leads/first-contact";
import { SEGMENTS } from "@/lib/campaigns/email-preview";
import type { Revenue, RevenueCell } from "@/lib/campaigns/analytics";

// Weekly report copy. PROPOSAL: Hungarian UI copy is not final until Áron
// approves it. Shared by the /reports/weekly page and the Monday email so the
// two never drift. No emojis, no dash glyphs (portfolio style law).
export const REPORT_UI = {
  revenue: "Bevétel: nyert és deallé vált leadek",
  revenueTotal: "Összesen",
  revenueWon: "Nyert",
  revenueWonValue: "Nyert érték",
  revenueConverted: "Deal lett",
  revenueConvertedValue: "Deal érték",
  revenueNone: "Még nincs deallé vált lead ebben az időszakban.",
  revenueOtherCurrency: (n: number) => `${n} deal más pénznemben: nincs az összegekben.`,
  revenueSegment: "Szegmens",
  revenueChannel: "Csatorna",
  revenueSource: "Forrás",
  revenueCampaign: "Kampány",
  assistantMonth: (calls: number, tokens: number, usd: number) =>
    `Asszisztens (hónap): ${calls} hívás, ${tokens.toLocaleString("hu-HU")} token, kb. $${usd.toFixed(2)}`,
  title: "Heti értékesítési riport",
  last7: "Utolsó 7 nap",
  last28: "Utolsó 28 nap",
  leadsCreated: "Új leadek",
  bySourceTier: "Forrás és tier szerint",
  source: "Forrás",
  tier: "Tier",
  unknown: "ismeretlen",
  noTier: "nincs tier",
  tierA: "A tier leadek: első hívásig eltelt idő",
  tierATotal: "A tier lead",
  median: "Medián",
  p90: "90. percentilis",
  contacted: "Felhívva",
  awaitingCall: "Hívásra vár",
  withoutTask: "Nincs hívás feladat",
  callOutcomes: "Hívás eredmények",
  calls: "Hívás",
  demosBooked: "Foglalt demó",
  demosScheduled: "Ütemezett demó",
  demosHeld: "Megtartott demó",
  stageTransitions: "Lead fázisváltások",
  suppression: "Tiltólista",
  suppressionAdded: "Új tiltás",
  suppressionCancelled: "Tiltás miatt törölt piszkozat",
  topCompanies: "Legtöbbet érintett cégek",
  touches: "Érintés",
  demos: "Demók",
  transition: "Váltás",
  count: "Darab",
  empty: "Nincs adat ebben az időszakban.",
} as const;

/** null -> "-", else the board's formatMinutes. */
export const formatMinutesOrDash = (min: number | null): string => (min === null ? "-" : formatMinutes(min));

export interface RevenueLine extends Pick<RevenueCell, "won" | "wonValue" | "converted" | "convertedValue"> { label: string }

/** The revenue table, flat: a total line, then every channel, source, campaign and segment that has a deal or a win. Empty = no deal yet. */
export function revenueLines(r: Revenue): RevenueLine[] {
  if (r.total.converted === 0 && r.total.won === 0) return [];
  const dims: [string, { key: string | null; won: number; wonValue: number; converted: number; convertedValue: number }[], (k: string | null) => string][] = [
    [REPORT_UI.revenueChannel, r.byChannel, (k) => k ?? REPORT_UI.unknown],
    [REPORT_UI.revenueSource, r.bySource, (k) => k ?? REPORT_UI.unknown],
    [REPORT_UI.revenueCampaign, r.byCampaign, (k) => k ?? REPORT_UI.unknown],
    [REPORT_UI.revenueSegment, r.bySegment, (k) => (k && k in SEGMENTS ? `${k} (${SEGMENTS[k as keyof typeof SEGMENTS]})` : REPORT_UI.unknown)],
  ];
  return [
    { label: REPORT_UI.revenueTotal, ...r.total },
    ...dims.flatMap(([name, rows, label]) => rows.filter((x) => x.converted > 0 || x.won > 0).map((x) => ({ label: `${name}: ${label(x.key)}`, won: x.won, wonValue: x.wonValue, converted: x.converted, convertedValue: x.convertedValue }))),
  ];
}

/** The note that deals in another currency are not in the sums; null when there are none. */
export const revenueNote = (r: Revenue): string | null => (r.total.otherCurrency > 0 ? REPORT_UI.revenueOtherCurrency(r.total.otherCurrency) : null);
