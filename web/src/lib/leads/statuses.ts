// Lead pipeline statuses — the kanban columns, in order.
// status is a free-text column on `leads`; these define the canonical set the
// UI works. Inbound leads land in "new".

export interface LeadStatusDef {
  key: string;
  label: string;
  color: string;
  /** Terminal-lost style column (greyed). */
  terminal?: boolean;
}

export const LEAD_STATUSES: LeadStatusDef[] = [
  { key: "new",           label: "Új",            color: "var(--indigo)" },
  { key: "contacted",     label: "Megkeresve",    color: "var(--sky)" },
  { key: "replied",       label: "Válaszolt",     color: "var(--violet)" },
  { key: "call_booked",   label: "Hívás egyeztetve", color: "var(--amber)" },
  { key: "qualified",     label: "Minősített",    color: "var(--mint)" },
  { key: "proposal_sent", label: "Ajánlat kiment", color: "oklch(0.78 0.13 200)" },
  { key: "unqualified",   label: "Nem minősül",   color: "var(--coral)", terminal: true },
  { key: "nurture",       label: "Gondozás",      color: "var(--fg-mute)", terminal: true },
];

export const LEAD_STATUS_KEYS = LEAD_STATUSES.map((s) => s.key);

export function leadStatusLabel(key: string | null): string {
  if (!key) return "—";
  return LEAD_STATUSES.find((s) => s.key === key)?.label ?? key;
}

export function isLeadStatus(key: string): boolean {
  return LEAD_STATUS_KEYS.includes(key);
}
