import type { ReplyType } from "./campaign";

// ⚠️ HU PROPOSALS — not signed off by Áron (translating-english-to-hungarian pass only).
export const REPLY_TYPE_LABEL: Record<ReplyType | "unknown", string> = {
  interested: "Érdeklődik",
  question: "Kérdez",
  forwarded: "Továbbküldte",
  not_now: "Most nem",
  no: "Nem kér",
  unsubscribed: "Leiratkozott",
  auto_reply: "Automatikus válasz",
  unknown: "Nincs megadva",
};
