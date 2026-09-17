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

export const STATUS_COLORS: Record<ContentStatus, string> = {
  draft: "#64748b",
  in_review: "#f59e0b",
  changes_requested: "#f97316",
  rewrite_requested: "#ef4444",
  ai_working: "#8b5cf6",
  live: "#22c55e",
  archived: "#94a3b8",
};

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
