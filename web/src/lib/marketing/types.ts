// Marketing module — app-level enums + Hungarian labels. The codebase stores
// these as plain strings (no Prisma enums); these arrays are the single source
// of truth for validation (Zod) and display (UI). Keep DB strings and these in
// sync.

export const CONTENT_CHANNELS = [
  "linkedin_personal",
  "linkedin_company",
  "facebook",
  "blog",
  "email",
  "other",
] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

export const CONTENT_TYPES = [
  "post",
  "article",
  "email",
  "video_script",
  "other",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// Statuses now belong to the content approval pipeline (lib/content/types.ts).
export { CONTENT_STATUSES, type ContentStatus } from "@/lib/content/types";
import type { ContentStatus } from "@/lib/content/types";

export const ASSET_KINDS = ["image", "video", "file", "link"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

// ── Display labels (Hungarian UI) ────────────────────────────────────────────
export const CHANNEL_LABELS: Record<ContentChannel, string> = {
  linkedin_personal: "LinkedIn (személyes)",
  linkedin_company: "LinkedIn (céges)",
  facebook: "Facebook",
  blog: "Blog",
  email: "Email",
  other: "Egyéb",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  post: "Poszt",
  article: "Cikk",
  email: "Email",
  video_script: "Videó forgatókönyv",
  other: "Egyéb",
};

// ⚠️ HU proposals (content approval pipeline, 2026-09-17).
export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Piszkozat",
  in_review: "Bírálatra vár",
  changes_requested: "Javítást kértek",
  rewrite_requested: "Újraírást kértek",
  ai_working: "Az AI dolgozik rajta",
  live: "Élő",
  archived: "Archiválva",
};

/**
 * Status chip tones. Token triples rather than hex, so the chips stay
 * readable in both themes — a hex tuned for the dark panel (#f59e0b as text)
 * drops to ~2:1 on white. Six distinct hues plus two greys: the status is
 * still legible from colour alone at a glance, in either theme.
 */
export interface StatusTone {
  fg: string;
  bg: string;
  line: string;
}

export const STATUS_TONES: Record<ContentStatus, StatusTone> = {
  draft:             { fg: "var(--fg-mute)",   bg: "var(--bg-raised)",   line: "var(--line-soft)" },
  in_review:         { fg: "var(--amber-fg)",  bg: "var(--amber-soft)",  line: "var(--amber-line)" },
  changes_requested: { fg: "var(--orange-fg)", bg: "var(--orange-soft)", line: "var(--orange-line)" },
  rewrite_requested: { fg: "var(--coral-fg)",  bg: "var(--coral-soft)",  line: "var(--coral-line)" },
  ai_working:        { fg: "var(--violet-fg)", bg: "var(--violet-soft)", line: "var(--violet-line)" },
  live:              { fg: "var(--mint-fg)",   bg: "var(--mint-soft)",   line: "var(--mint-line)" },
  archived:          { fg: "var(--fg-faint)",  bg: "var(--bg-raised)",   line: "var(--line-soft)" },
};

export const UNKNOWN_STATUS_TONE: StatusTone = STATUS_TONES.draft;

export function statusTone(status: string): StatusTone {
  return STATUS_TONES[status as ContentStatus] ?? UNKNOWN_STATUS_TONE;
}

// Order the review queue renders its status sections in.
export const QUEUE_SECTION_ORDER: ContentStatus[] = [
  "in_review",
  "changes_requested",
  "rewrite_requested",
  "ai_working",
  "live",
  "draft",
  "archived",
];
