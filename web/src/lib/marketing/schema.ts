import { z } from "zod";
import { CONTENT_CHANNELS, CONTENT_TYPES, ASSET_KINDS } from "./types";

// Inbound content-draft payload (POST /api/content). The content factory (an
// external scheduled job) posts this shape; same per-app-key auth as
// /api/leads. snake_case on the wire to match the other ingestion endpoints.

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optStr = z.preprocess(emptyToUndef, z.string().trim().max(10000).optional());

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

  // Generator metadata (hook refs, week, notes) — stored verbatim on sourceMeta.
  source_meta: z.record(z.string(), z.unknown()).optional(),
  scheduled_for: z.preprocess(
    emptyToUndef,
    z.string().datetime({ offset: true }).optional(),
  ),
  // INTERNAL angles are never postable; the publish flow is hidden for them.
  internal: z.coerce.boolean().optional().default(false),

  assets: z.array(assetSchema).max(20).optional(),
});

export type ContentIntake = z.infer<typeof contentIntakeSchema>;

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
