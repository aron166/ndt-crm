// One-off ops: create the PRIVATE `content-assets` bucket with its size limit
// and MIME allow-list (idempotent). Run before the first upload on a new
// Supabase project:  node scripts/ensure-content-bucket.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from web/.env.local.
// Prod bucket created 2026-09-17 (public: false, 50 MB, image/video/pdf).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage;

const NAME = "content-assets";
const OPTIONS = {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm", "application/pdf"],
};

const { data } = await storage.getBucket(NAME);
const { error } = data ? await storage.updateBucket(NAME, OPTIONS) : await storage.createBucket(NAME, OPTIONS);
if (error) { console.error(error.message); process.exit(1); }
const { data: after } = await storage.getBucket(NAME);
console.log(data ? "updated" : "created", { public: after.public, limit: after.file_size_limit, mime: after.allowed_mime_types });
