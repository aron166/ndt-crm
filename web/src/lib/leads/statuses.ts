// Lead-pipeline statuses (the kanban columns). These are now DB-backed and
// customizable per tenant (table lead_statuses) — this file holds the shared
// TYPE, the default set used to seed a tenant / fall back when none exist, and a
// pure label helper. DB reads live in lib/leads/queries.ts (server-only).

export interface LeadStatusDef {
  key: string;
  label: string;
  color: string;
  position: number;
  /** Where inbound API leads land (mirrors a pipeline's first stage). */
  isInitial: boolean;
  /** Terminal-lost style column (greyed). */
  isTerminal: boolean;
  /**
   * The booking column = the order (megrendelés). Péter's rule: offer
   * acceptance is NOT an order; the calendar booking IS. This marks the
   * commitment point so the board, reporting and automations can detect it.
   */
  isCommitment: boolean;
}

// Default columns = Péter's canonical qualification funnel (decisions.md #11,
// raw39). Used to seed a NEW tenant and as the fallback when a tenant has no
// lead_statuses rows yet. Existing tenants own their board (it's customizable at
// /leads/setup, table lead_statuses) — changing this default does NOT touch them.
// The funnel's meaning, stage by stage, is documented in decisions.md #11.
export const DEFAULT_LEAD_STATUSES: LeadStatusDef[] = [
  // lead_gen = interest expressed, name + email captured — this is what makes it a lead.
  { key: "lead_gen",         label: "Érdeklődő (lead)",         color: "#6366f1", position: 0,  isInitial: true,  isTerminal: false, isCommitment: false },
  // phone_permission = phone number given = explicit consent to be contacted.
  { key: "phone_permission", label: "Telefonszám megadva",      color: "#3b82f6", position: 1,  isInitial: false, isTerminal: false, isCommitment: false },
  // needs_assessment = first call ("ismerjük meg egymást"); also our market research.
  { key: "needs_assessment", label: "Igényfelmérés",            color: "#8b5cf6", position: 2,  isInitial: false, isTerminal: false, isCommitment: false },
  // prequalified = right-fit confirmed (does NDT / has concrete), even with NO live project.
  { key: "prequalified",     label: "Előminősített",            color: "#f59e0b", position: 3,  isInitial: false, isTerminal: false, isCommitment: false },
  // qualified = a CONCRETE live project exists (the redefinition — not just "promising").
  { key: "qualified",        label: "Minősített (élő projekt)", color: "#22c55e", position: 4,  isInitial: false, isTerminal: false, isCommitment: false },
  { key: "proposal",         label: "Ajánlat kiment",           color: "#06b6d4", position: 5,  isInitial: false, isTerminal: false, isCommitment: false },
  // accepted = ajánlat elfogadva, NOT yet an order. Booking is the order (#9).
  { key: "accepted",         label: "Ajánlat elfogadva",        color: "#14b8a6", position: 6,  isInitial: false, isTerminal: false, isCommitment: false },
  // booked = időpont lefoglalva = MEGRENDELÉS, the commitment point (#9).
  { key: "booked",           label: "Lefoglalva (megrendelés)", color: "#16a34a", position: 7,  isInitial: false, isTerminal: false, isCommitment: true  },
  // delivered = teljesítve (completed scan; the teljesítésigazolás event).
  { key: "delivered",        label: "Teljesítve",               color: "#0ea5e9", position: 8,  isInitial: false, isTerminal: false, isCommitment: false },
  // expand = bővítés / újrarendelés (upsell / repeat business).
  { key: "expand",           label: "Bővítés / újrarendelés",   color: "#10b981", position: 9,  isInitial: false, isTerminal: false, isCommitment: false },
  { key: "unqualified",      label: "Nem minősül",              color: "#ef4444", position: 10, isInitial: false, isTerminal: true,  isCommitment: false },
  { key: "nurture",          label: "Gondozás",                 color: "#64748b", position: 11, isInitial: false, isTerminal: true,  isCommitment: false },
];

export function leadStatusLabel(key: string | null, statuses: LeadStatusDef[]): string {
  if (!key) return "—";
  return statuses.find((s) => s.key === key)?.label ?? key;
}
