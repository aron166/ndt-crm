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
  /**
   * What happens in this phase and where the script lives — the stage's own
   * documentation, shown on the kanban column header and in the call-outcome
   * modal (Péter, 2026-09-07). Free text; line breaks are preserved on render.
   */
  description: string | null;
}

/** What every stage starts with until Áron/Péter write the real script. */
export const STAGE_DESCRIPTION_PLACEHOLDER = "TODO: mit csinálunk ebben a fázisban, hol a script";
export const STAGE_DESCRIPTION_MAX = 4000;

// Default columns = the launch lead board (BRIEFING_2026-09-04): the leads board
// is about GETTING TO A DEMO; money after the demo lives on the deal pipeline,
// and `Lead.outcome = won` is the only door between them. Péter's longer
// qualification funnel (decisions.md #11) is therefore split: its post-demo
// stages (proposal → booked → delivered) are deal-pipeline stages now.
// Existing tenants own their board (customizable at /leads/setup); this is the
// seed for a new tenant + the fallback when a tenant has no rows.
// Default columns = the W2 lead lifecycle (one pipeline, lib/leads/lifecycle.ts):
// main line new > ... > won, side states recall + lost (board filters). Labels
// are PROPOSAL until Áron approves. Existing tenants own their board
// (customizable at /leads/setup); this is the seed for a new tenant + the
// fallback when a tenant has no rows. Keys must match lifecycle.ALL_STAGES.
export const DEFAULT_LEAD_STATUSES: LeadStatusDef[] = [
  { key: "new", label: "Új", color: "#6366f1", position: 0, isInitial: true , isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "contacting", label: "Hívás alatt", color: "#3b82f6", position: 1, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "discovery_booked", label: "Egyeztetés foglalva", color: "#8b5cf6", position: 2, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "qualified", label: "Minősítve", color: "#a855f7", position: 3, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "offer_sent", label: "Ajánlat kiküldve", color: "#f59e0b", position: 4, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "demo_booked", label: "Demó foglalva", color: "#22c55e", position: 5, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "demo_done", label: "Demó kész", color: "#16a34a", position: 6, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "ordered", label: "Megrendelve", color: "#0ea5e9", position: 7, isInitial: false, isTerminal: false, isCommitment: true , description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "won", label: "Megnyert", color: "#15803d", position: 8, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "recall", label: "Visszahívás", color: "#f97316", position: 9, isInitial: false, isTerminal: false, isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
  { key: "lost", label: "Elveszett", color: "#6b7280", position: 10, isInitial: false, isTerminal: true , isCommitment: false, description: STAGE_DESCRIPTION_PLACEHOLDER },
];

export function leadStatusLabel(key: string | null, statuses: LeadStatusDef[]): string {
  if (!key) return "-";
  return statuses.find((s) => s.key === key)?.label ?? key;
}
