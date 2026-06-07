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

// Default columns — mirrors the seed in migration 20260607190000. Used as a
// fallback if a tenant has no lead_statuses rows yet.
export const DEFAULT_LEAD_STATUSES: LeadStatusDef[] = [
  { key: "new",           label: "Új",                       color: "#6366f1", position: 0, isInitial: true,  isTerminal: false, isCommitment: false },
  { key: "contacted",     label: "Megkeresve",               color: "#3b82f6", position: 1, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "replied",       label: "Válaszolt",                color: "#8b5cf6", position: 2, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "call_booked",   label: "Hívás egyeztetve",         color: "#f59e0b", position: 3, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "qualified",     label: "Minősített",               color: "#22c55e", position: 4, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "proposal_sent", label: "Ajánlat kiment",           color: "#06b6d4", position: 5, isInitial: false, isTerminal: false, isCommitment: false },
  // Ajánlat elfogadva = accepted, NOT yet an order. Booking is the order.
  { key: "accepted",      label: "Ajánlat elfogadva",        color: "#14b8a6", position: 6, isInitial: false, isTerminal: false, isCommitment: false },
  // Lefoglalva = időpont lefoglalva = MEGRENDELÉS, the commitment point.
  { key: "booked",        label: "Lefoglalva (megrendelés)", color: "#16a34a", position: 7, isInitial: false, isTerminal: false, isCommitment: true  },
  { key: "unqualified",   label: "Nem minősül",              color: "#ef4444", position: 8, isInitial: false, isTerminal: true,  isCommitment: false },
  { key: "nurture",       label: "Gondozás",                 color: "#64748b", position: 9, isInitial: false, isTerminal: true,  isCommitment: false },
];

export function leadStatusLabel(key: string | null, statuses: LeadStatusDef[]): string {
  if (!key) return "—";
  return statuses.find((s) => s.key === key)?.label ?? key;
}
