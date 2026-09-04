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

// Default columns = the launch lead board (BRIEFING_2026-09-04): the leads board
// is about GETTING TO A DEMO; money after the demo lives on the deal pipeline,
// and `Lead.outcome = won` is the only door between them. Péter's longer
// qualification funnel (decisions.md #11) is therefore split: its post-demo
// stages (proposal → booked → delivered) are deal-pipeline stages now.
// Existing tenants own their board (customizable at /leads/setup); this is the
// seed for a new tenant + the fallback when a tenant has no rows.
export const DEFAULT_LEAD_STATUSES: LeadStatusDef[] = [
  { key: "new",         label: "Új",                    color: "#6366f1", position: 0, isInitial: true,  isTerminal: false, isCommitment: false },
  { key: "call_1",      label: "1. hívás",              color: "#3b82f6", position: 1, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "call_2",      label: "2. hívás",              color: "#8b5cf6", position: 2, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "call_3",      label: "3. hívás",              color: "#a855f7", position: 3, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "call_3_plus", label: "3+ hívás",              color: "#f59e0b", position: 4, isInitial: false, isTerminal: false, isCommitment: false },
  // recall = the lead asked to be called back; the card shows the callback due.
  { key: "recall",      label: "Visszahívás",           color: "#f97316", position: 5, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "demo_aron",   label: "Demó foglalva (Áron)",  color: "#22c55e", position: 6, isInitial: false, isTerminal: false, isCommitment: false },
  { key: "demo_peter",  label: "Demó foglalva (Péter)", color: "#16a34a", position: 7, isInitial: false, isTerminal: false, isCommitment: false },
];

export function leadStatusLabel(key: string | null, statuses: LeadStatusDef[]): string {
  if (!key) return "—";
  return statuses.find((s) => s.key === key)?.label ?? key;
}
