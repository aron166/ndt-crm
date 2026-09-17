import sharp from "sharp";
import { downloadObject, statObject, uploadObject } from "./storage";
import { reportError } from "@/lib/report-error";

/**
 * Server-side WebP thumbnails for image uploads (NATE-STORAGE-1). PDFs and
 * videos are never thumbnailed here — sharp cannot rasterize PDFs and AI/video
 * rendering is out of scope (Áron's constraint); `generateThumbnail` just
 * returns null for them. A missing thumbnail must never fail a version save.
 */

export const THUMB_MAX = 480;
export const THUMB_SUFFIX = ".thumb.webp";

/** 25 MB: past this the conversion cost isn't worth it for an outlier. */
const THUMB_SKIP_ABOVE_BYTES = 25 * 1024 * 1024;

const THUMBNAILABLE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function thumbPathFor(storagePath: string): string {
  return `${storagePath}${THUMB_SUFFIX}`;
}

export async function generateThumbnail(originalPath: string): Promise<{ path: string; bytes: number } | null> {
  try {
    const stat = await statObject(originalPath);
    if (!stat || !THUMBNAILABLE_MIME.has(stat.mimeType)) return null;
    if (stat.size > THUMB_SKIP_ABOVE_BYTES) {
      console.warn(`[thumbnails] skipping oversized original (${stat.size} bytes): ${originalPath}`);
      return null;
    }
    const original = await downloadObject(originalPath);
    if (!original) return null;
    const webp = await sharp(original)
      .rotate()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    const path = thumbPathFor(originalPath);
    await uploadObject(path, webp, "image/webp");
    return { path, bytes: webp.byteLength };
  } catch (err) {
    reportError("content.generateThumbnail", err, { originalPath });
    return null;
  }
}
