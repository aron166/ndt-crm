import { z } from "zod";
import { CONTENT_CHANNELS, CONTENT_TYPES, ASSET_KINDS } from "./types";
import { CONTENT_CATEGORIES, type ContentCategory } from "@/lib/content/types";

// Inbound content-draft payload (POST /api/content). The content factory (an
// external scheduled job) posts this shape; same per-app-key auth as
// /api/leads. snake_case on the wire to match the other ingestion endpoints.

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optStr = z.preprocess(emptyToUndef, z.string().trim().max(10000).optional());

// z.coerce.boolean() is a footgun: it's just Boolean(v), so the string "false"
// coerces to TRUE. For the `internal` flag (INTERNAL = never postable) that would
// be a silent safety inversion. Parse booleans explicitly instead.
const boolishSchema = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(s)) return true;
    if (["false", "0", "no", "off", ""].includes(s)) return false;
  }
  return v;
}, z.boolean());
const boolish = boolishSchema.optional().default(false);

const assetSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  url: z.string().trim().min(1).max(2000),
  caption: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
});

export const contentIntakeSchema = z.object({
  // Campaign is referenced by slug; the route auto-creates it if missing.
  campaign_slug: z.preprocess(emptyToUndef, z.string().trim().min(1).max(120).optional()),
  campaign_name: optStr, // used as the name when auto-creating the campaign
  project: optStr,

  channel: z.enum(CONTENT_CHANNELS),
  content_type: z.enum(CONTENT_TYPES),
  title: z.preprocess(emptyToUndef, z.string().trim().min(1).max(300)),
  body: z.preprocess(emptyToUndef, z.string().trim().min(1).max(50000)),

  // Content approval pipeline (2026-09-17) — optional; category defaults from
  // content_type when omitted (see defaultCategory below).
  category: z.enum(CONTENT_CATEGORIES).optional(),
  format: z.preprocess(emptyToUndef, z.string().trim().max(60).optional()),
  purpose: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
  external_ref: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  change_note: z.preprocess(emptyToUndef, z.string().trim().max(4000).optional()),
  // Imported existing material is authored `import`, not `ai` (lib/content/service.ts).
  import: boolish,
  // Extract ⚠ markers into blocking checks (spec §6c) on create. Left
  // undefined here — the route defaults it to `import`'s value, so a plain
  // import gets checks and a normal AI post doesn't get a surprise checklist
  // unless it opts in explicitly.
  extract_warnings: boolishSchema.optional(),

  // Generator metadata (hook refs, week, notes) — stored verbatim on sourceMeta.
  source_meta: z.record(z.string(), z.unknown()).optional(),
  scheduled_for: z.preprocess(
    emptyToUndef,
    z.string().datetime({ offset: true }).optional(),
  ),
  // INTERNAL angles are never postable; the publish flow is hidden for them.
  internal: boolish,

  /** The company this piece is for: its dossier feeds the rewrite loop. */
  company_id: z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional()),
  /** Submitting agent's own judgement: confidence 0..1 and a short note. */
  self_score: z.preprocess(emptyToUndef, z.coerce.number().min(0).max(1).optional()),
  self_note: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),

  assets: z.array(assetSchema).max(20).optional(),
});

export type ContentIntake = z.infer<typeof contentIntakeSchema>;

/** category default when the caller doesn't send one: content_type-derived. */
export function defaultCategory(contentType: ContentIntake["content_type"]): ContentCategory {
  if (contentType === "email") return "email";
  if (contentType === "video_script") return "video";
  return "other";
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip combining diacritics (á→a)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "campaign"
  );
}

/** Resolve the campaign slug to use: explicit slug, else slugified name. */
export function resolveCampaignSlug(input: ContentIntake): string | null {
  if (input.campaign_slug) return slugify(input.campaign_slug);
  if (input.campaign_name) return slugify(input.campaign_name);
  return null;
}
