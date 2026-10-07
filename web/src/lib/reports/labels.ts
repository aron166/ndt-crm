// Weekly report copy. PROPOSAL: Hungarian UI copy is not final until Áron
// approves it. Shared by the /reports/weekly page and the Monday email so the
// two never drift. No emojis, no dash glyphs (portfolio style law).
export const REPORT_UI = {
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
  empty: "Nincs adat ebben az időszakban.",
} as const;

/** 95 -> "1 ó 35 p", 12 -> "12 p", null -> "-". */
export function formatMinutes(min: number | null): string {
  if (min === null) return "-";
  if (min < 60) return `${min} p`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} ó` : `${h} ó ${m} p`;
}
