// Quote status taxonomy + presentation (labels + colors). Pure module so it's
// safe to import from both client components and the "use server" actions file
// (which may only *export* async functions — hence the const lives here).

// Quote lifecycle. Acceptance is NOT an order (decisions.md #9) — accepting a
// quote never advances the linked deal; Péter does that manually.
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
  draft:    { label: "Piszkozat", color: "var(--ui-text-muted)", bg: "var(--ui-surface-muted)" },
  sent:     { label: "Elküldve",  color: "var(--ui-text-muted)", bg: "var(--ui-surface-muted)" },
  accepted: { label: "Elfogadva", color: "var(--ui-success-text)", bg: "var(--ui-surface-muted)" },
  rejected: { label: "Elutasítva", color: "var(--ui-danger-text)", bg: "var(--ui-surface-muted)" },
  expired:  { label: "Lejárt",    color: "var(--ui-warning-text)", bg: "var(--ui-surface-muted)" },
};

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_META[status as QuoteStatus]?.label ?? status;
}
