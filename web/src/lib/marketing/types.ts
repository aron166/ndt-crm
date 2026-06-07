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

export const CONTENT_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "rejected",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

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

export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Piszkozat",
  in_review: "Jóváhagyásra vár",
  approved: "Jóváhagyva",
  scheduled: "Ütemezve",
  published: "Megjelent",
  rejected: "Elutasítva",
};

export const STATUS_COLORS: Record<ContentStatus, string> = {
  draft: "#64748b",
  in_review: "#f59e0b",
  approved: "#22c55e",
  scheduled: "#06b6d4",
  published: "#6366f1",
  rejected: "#ef4444",
};

// Order the review queue renders its status sections in.
export const QUEUE_SECTION_ORDER: ContentStatus[] = [
  "in_review",
  "approved",
  "scheduled",
  "published",
  "rejected",
];
