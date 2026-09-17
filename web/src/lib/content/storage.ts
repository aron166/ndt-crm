import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Content files (spec §2): a PRIVATE Supabase Storage bucket, per-tenant path
 * prefix, signed URLs for viewing, size/type allow-list. Server-only — the
 * service-role key never reaches the browser; the browser only ever gets a
 * one-off signed upload URL for one exact path, or a short-lived view URL.
 */

export const CONTENT_BUCKET = "content-assets";
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const VIEW_URL_TTL_S = 60 * 60;

export const ALLOWED_MIME: Record<string, "image" | "video" | "file"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "file",
};

let client: SupabaseClient | null = null;
function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage is not configured");
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Every object of a tenant's item lives under this prefix. */
export function itemPrefix(tenantId: number, itemId: number): string {
  return `t${tenantId}/items/${itemId}/`;
}

/** Keep the original name readable but path-safe (no slashes, no dots-only, ≤ 80 chars). */
export function safeFileName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(-80);
  return base || "file";
}

export function stagingPath(tenantId: number, itemId: number, fileName: string): string {
  return `${itemPrefix(tenantId, itemId)}staging/${randomUUID()}-${safeFileName(fileName)}`;
}

/** A path the caller may register for this item: under its prefix, no traversal. */
export function isPathForItem(path: string, tenantId: number, itemId: number): boolean {
  return path.startsWith(itemPrefix(tenantId, itemId)) && !path.includes("..") && !path.includes("//");
}

export async function createUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await admin().storage.from(CONTENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`createSignedUploadUrl failed: ${error?.message ?? "no data"}`);
  return { signedUrl: data.signedUrl, token: data.token };
}

/** Size + content type of an uploaded object, or null when it does not exist. */
export async function statObject(path: string): Promise<{ size: number; mimeType: string } | null> {
  const { data, error } = await admin().storage.from(CONTENT_BUCKET).info(path);
  if (error || !data) return null;
  const size = Number(data.size ?? (data as { metadata?: { size?: number } }).metadata?.size ?? NaN);
  const mimeType = String(data.contentType ?? (data as { metadata?: { mimetype?: string } }).metadata?.mimetype ?? "");
  if (!Number.isFinite(size) || !mimeType) return null;
  return { size, mimeType };
}

export async function signedViewUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return {};
  const { data, error } = await admin().storage.from(CONTENT_BUCKET).createSignedUrls(unique, VIEW_URL_TTL_S);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** Delete uploaded objects (hard delete of an item, §6c). Best effort. */
export async function removeObjects(paths: string[]): Promise<void> {
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return;
  const { error } = await admin().storage.from(CONTENT_BUCKET).remove(unique);
  if (error) throw new Error(`storage remove failed: ${error.message}`);
}

/** Same bucket settings as scripts/ensure-content-bucket.mjs (the ops path). Not called by requests. */
export async function ensureBucket(): Promise<"created" | "exists"> {
  const s = admin().storage;
  const { data } = await s.getBucket(CONTENT_BUCKET);
  if (data) return "exists";
  const { error } = await s.createBucket(CONTENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ASSET_BYTES,
    allowedMimeTypes: Object.keys(ALLOWED_MIME),
  });
  if (error) throw new Error(`createBucket failed: ${error.message}`);
  return "created";
}
