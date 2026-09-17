#!/usr/bin/env node
// NATE-STORAGE-1: find objects in the `content-assets` bucket that no
// content_assets row (storage_path or thumb_path) references, so we can see
// what abandoned staging uploads / dangling thumbnails are costing us.
//
// Read-only by default: SELECTs content_assets (DATABASE_URL) and lists the
// bucket (service-role key), prints a table + total reclaimable bytes, writes
// nothing. Safe to run against prod in this mode.
//
// --delete actually removes orphans, and refuses unless BOTH
// --i-have-arons-approval AND --older-than-days N are given (no default —
// omitting --older-than-days refuses even with approval). Deletes in
// batches of 100.
//
// Run from web/: node scripts/storage-orphans.mjs [--delete --i-have-arons-approval --older-than-days N]

import fs from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));

const BUCKET = "content-assets";

const args = process.argv.slice(2);
const DELETE = args.includes("--delete");
const HAS_APPROVAL = args.includes("--i-have-arons-approval");
const olderThanArg = args.find((a) => a.startsWith("--older-than-days="))?.split("=")[1]
  ?? (args.includes("--older-than-days") ? args[args.indexOf("--older-than-days") + 1] : undefined);
const OLDER_THAN_DAYS = olderThanArg !== undefined ? Number(olderThanArg) : undefined;
const DO_DELETE = DELETE && HAS_APPROVAL && Number.isFinite(OLDER_THAN_DAYS) && OLDER_THAN_DAYS > 0;

if (DELETE && !DO_DELETE) {
  console.error(
    "Refusing --delete: needs BOTH --i-have-arons-approval AND --older-than-days N (N > 0). Running read-only instead.",
  );
}

const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from(BUCKET);

// Recursively list every object in the bucket (Supabase .list() is one level at a time).
async function listAll(prefix = "") {
  const out = [];
  const { data, error } = await storage.list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`storage.list(${prefix}) failed: ${error.message}`);
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      // A "directory" placeholder — recurse into it.
      out.push(...await listAll(path));
    } else {
      out.push({
        path,
        size: entry.metadata?.size ?? 0,
        updatedAt: entry.updated_at ?? entry.created_at ?? null,
      });
    }
  }
  return out;
}

async function referencedPaths() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    // ponytail: thumb_path may not exist yet (migration not applied to this DB) —
    // fall back to storage_path only rather than failing the whole report.
    let rows;
    try {
      ({ rows } = await client.query(
        `SELECT storage_path, thumb_path FROM content_assets WHERE storage_path IS NOT NULL OR thumb_path IS NOT NULL`,
      ));
    } catch (err) {
      if (err.code !== "42703") throw err;
      console.error("note: content_assets.thumb_path does not exist yet (migration not applied) — checking storage_path only");
      ({ rows } = await client.query(`SELECT storage_path FROM content_assets WHERE storage_path IS NOT NULL`));
    }
    const set = new Set();
    for (const r of rows) {
      if (r.storage_path) set.add(r.storage_path);
      if (r.thumb_path) set.add(r.thumb_path);
    }
    return set;
  } finally {
    await client.end();
  }
}

function ageDays(updatedAt) {
  if (!updatedAt) return null;
  return (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
}

const [objects, referenced] = await Promise.all([listAll(), referencedPaths()]);
const orphans = objects.filter((o) => !referenced.has(o.path));

console.log(`bucket objects: ${objects.length}, referenced: ${referenced.size}, orphans: ${orphans.length}`);
console.log("");
console.log("path\tsize_bytes\tage_days");
let totalBytes = 0;
for (const o of orphans.sort((a, b) => (ageDays(b.updatedAt) ?? 0) - (ageDays(a.updatedAt) ?? 0))) {
  const age = ageDays(o.updatedAt);
  totalBytes += o.size;
  console.log(`${o.path}\t${o.size}\t${age === null ? "?" : age.toFixed(1)}`);
}
console.log("");
console.log(`total reclaimable: ${totalBytes} bytes (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);

if (!DO_DELETE) process.exit(0);

const toDelete = orphans.filter((o) => {
  const age = ageDays(o.updatedAt);
  return age !== null && age >= OLDER_THAN_DAYS;
});
console.log(`\n--delete: removing ${toDelete.length} objects older than ${OLDER_THAN_DAYS} days, in batches of 100...`);
for (let i = 0; i < toDelete.length; i += 100) {
  const batch = toDelete.slice(i, i + 100).map((o) => o.path);
  const { error } = await storage.remove(batch);
  if (error) { console.error(`batch ${i / 100} failed: ${error.message}`); process.exit(1); }
  console.log(`deleted batch ${i / 100 + 1} (${batch.length} objects)`);
}
console.log("done.");
