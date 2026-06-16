// Quote status taxonomy + presentation (labels + colors). Pure module so it's
// safe to import from both client components and the "use server" actions file
// (which may only *export* async functions — hence the const lives here).

// Quote lifecycle. Acceptance is NOT an order (decisions.md #9) — accepting a
// quote never advances the linked deal; Péter does that manually.
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
  draft:    { label: "Piszkozat", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  sent:     { label: "Elküldve",  color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  accepted: { label: "Elfogadva", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  rejected: { label: "Elutasítva", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  expired:  { label: "Lejárt",    color: "#a16207", bg: "rgba(161,98,7,0.12)" },
};

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_META[status as QuoteStatus]?.label ?? status;
}
