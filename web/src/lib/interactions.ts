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
