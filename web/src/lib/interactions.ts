export const INTERACTION_TYPE_LABEL: Record<string, string> = {
  call: "Telefonhívás",
  email: "Email",
  meeting: "Találkozó",
  site_visit: "Helyszíni látogatás",
  note: "Megjegyzés",
};

export const INTERACTION_DIRECTION_LABEL: Record<string, string> = {
  outbound: "Kimenő",
  inbound: "Bejövő",
};

export function interactionTypeLabel(type: string | null): string {
  if (!type) return "Ismeretlen";
  return INTERACTION_TYPE_LABEL[type] ?? type;
}

export function interactionDirectionLabel(direction: string | null): string {
  if (!direction) return "";
  return INTERACTION_DIRECTION_LABEL[direction] ?? direction;
}

export interface LogInteractionInput {
  type?: string;
  notes?: string;
  occurredAt?: string;
  direction?: string;
  outcome?: string;
  companyId?: number | null;
  personId?: number | null;
}

export function validateInteractionInput(input: LogInteractionInput): string | null {
  if (!input.type?.trim()) return "Típus kötelező";
  if (!input.notes?.trim()) return "Megjegyzés kötelező";
  if (!input.occurredAt) return "Dátum kötelező";
  return null;
}
