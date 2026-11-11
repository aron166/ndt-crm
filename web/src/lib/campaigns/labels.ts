// Campaigns hub: UI labels and small pure helpers (internal UI wording, follows the surrounding
// pages). Hungarian copy is PROPOSAL until Áron approves it.

import { MEMBER_KINDS, type CampaignKind, type CampaignStatus, type StepChannel } from "./rules";

/** The five kinds offered at creation, in the order of mockup A. `content` and null are pre-v2 rows. */
export const CREATE_KINDS: readonly { kind: CampaignKind; label: string; hint: string }[] = [
  { kind: "ad", label: "Hirdetés", hint: "Meta, Google. Csak anyagok és kézzel rögzített számok." },
  { kind: "organic", label: "Organikus", hint: "Poszt, blog. Csak anyagok és kézzel rögzített számok." },
  { kind: "cold_call", label: "Hidegtelefon", hint: "Csak hívás, Hívás mód." },
  { kind: "cold_email", label: "Hideg e-mail", hint: "Csak e-mail, Outreach." },
  { kind: "sequence", label: "Sorozat", hint: "Előbb e-mail, utána hívás. Mindenkinek az e-mail az első." },
];

export const KIND_LABEL: Record<string, string> = {
  ad: "Hirdetés", organic: "Organikus", cold_call: "Hidegtelefon", cold_email: "Hideg e-mail",
  sequence: "Sorozat", content: "Tartalom",
};
export const kindLabel = (k: string | null) => (k ? KIND_LABEL[k] ?? k : "Marketing (régi)");

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Piszkozat", running: "Fut", paused: "Szünetel", stopped: "Leállítva", done: "Kész",
};
export const statusLabel = (s: string) => STATUS_LABEL[s as CampaignStatus] ?? s;

export const CHANNEL_LABEL: Record<StepChannel, string> = {
  email: "E-mail", call: "Hívás", ad: "Hirdetés", post: "Poszt", dm: "Üzenet",
};

/** Content only for now: assets and hand-entered numbers, no members, no launch (ad, organic, content, pre-v2). */
export const isContentOnly = (kind: string | null) => !MEMBER_KINDS.includes(kind as CampaignKind);

/** The channels a step may use for a kind (rules.stepsFitKind is the server-side check). */
export function channelsFor(kind: CampaignKind): StepChannel[] {
  if (kind === "cold_call") return ["call"];
  if (kind === "cold_email") return ["email"];
  if (kind === "sequence") return ["email", "call"];
  return [];
}

export interface StepDraft { channel: StepChannel; wait_days: number; audience_rule: "all" | "no_reply" | "no_answer"; content_item_id?: number | null }

/** The step plan a new campaign of this kind starts with; the launch list default is the sequence. */
export function defaultSteps(kind: CampaignKind): StepDraft[] {
  if (kind === "sequence") return [
    { channel: "email", wait_days: 0, audience_rule: "all" },
    { channel: "call", wait_days: 3, audience_rule: "no_reply" },
  ];
  if (kind === "cold_call") return [{ channel: "call", wait_days: 0, audience_rule: "all" }];
  if (kind === "cold_email") return [{ channel: "email", wait_days: 0, audience_rule: "all" }];
  return [];
}

const AUDIENCE_LABEL: Record<StepDraft["audience_rule"], string> = {
  all: "mindenkinek", no_reply: "akik nem válaszoltak", no_answer: "akik nem vették fel",
};
export function stepLine(s: { channel: string; waitDays?: number; wait_days?: number; audienceRule?: string; audience_rule?: string }): string {
  const wait = s.waitDays ?? s.wait_days ?? 0;
  const rule = (s.audienceRule ?? s.audience_rule ?? "all") as StepDraft["audience_rule"];
  const parts = [CHANNEL_LABEL[s.channel as StepChannel] ?? s.channel];
  if (wait > 0) parts.push(`${wait} munkanap után`);
  if (rule !== "all") parts.push(AUDIENCE_LABEL[rule] ?? rule);
  return parts.join(", ");
}

/** Group a call list by city, keeping the list's own order inside a group and the first-seen order of cities. */
export function groupByCity<T extends { city: string | null; company?: { city: string | null } | null }>(items: readonly T[]): { city: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const city = it.city ?? it.company?.city ?? "Város nélkül";
    groups.set(city, [...(groups.get(city) ?? []), it]);
  }
  return [...groups.entries()].map(([city, list]) => ({ city, items: list }));
}

/**
 * The default batch id for a load started from the UI: ui-YYYYMMDD-HHMMSS-xxxx. The random tail keeps
 * two loads in the same second apart, so one undo never removes both (Vanda #190-6).
 */
export function uiBatchId(now: Date, rand: () => number = Math.random): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const tail = Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0");
  return `ui-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${tail}`;
}

/** The hub's type tab: "all" or one kind (pre-v2 rows with no kind show under all only). */
export function filterByType<T extends { kind: string | null }>(rows: readonly T[], type: string): T[] {
  return type === "all" ? [...rows] : rows.filter((r) => r.kind === type);
}

/** Content approval pipeline states (lib/content/types), as the campaign pages name them. */
const ASSET_STATE: Record<string, string> = {
  draft: "piszkozat", in_review: "felülvizsgálatra", changes_requested: "javítást kértek", rewrite_requested: "újraírást kértek",
  ai_working: "az ügynök dolgozik rajta", live: "jóváhagyva (élő)", archived: "archivált",
};
export const assetStateLabel = (st: string) => ASSET_STATE[st] ?? st;
