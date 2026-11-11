// Loads nurture email drafts into nurture_templates as unapproved proposals. Approved rows are never touched.
// Usage (from web/): node scripts/import-nurture-templates.mjs --dir <drafts dir> --tenant 1 [--dry-run] [--prod]
// Reads DATABASE_URL from the environment only. --dry-run parses and prints the plan without connecting.
// Allowlist (Vanda W9-9): only a local database without --prod; prod imports only with Kai's go.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { parseDraft } from "../src/lib/nurture/import.ts";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = args.includes("--dry-run");
const dir = opt("dir");
const tenant = Number(opt("tenant"));
if (!dir || !Number.isInteger(tenant)) { console.error("usage: --dir <drafts dir> --tenant <id> [--dry-run] [--prod]"); process.exit(2); }
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(2); }
let host;
try { host = new URL(url).host; } catch { console.error("DATABASE_URL is not a valid URL"); process.exit(2); }
console.log(`target host: ${host}${dryRun ? " (dry run)" : ""}`);
if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) && !args.includes("--prod")) {
  console.error("refusing: non-local host without --prod"); process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => /-email\.md$/.test(f)).sort();
const rows = [];
for (const f of files) {
  const p = path.join(dir, f);
  const r = parseDraft(f, fs.readFileSync(p, "utf8"));
  if ("error" in r) console.error(`SKIP ${r.error}`); else rows.push({ ...r, sourcePath: p });
}

if (dryRun) {
  for (const r of rows) console.log(`would upsert ${r.key} "${r.subject}" requires_asset=${r.requiresAsset ?? "-"} <- ${r.sourcePath}`);
  console.log(`${rows.length}/${files.length} parsed`);
  process.exit(0);
}

const c = new pg.Client({ connectionString: url, ssl: host.includes("supabase") ? { rejectUnauthorized: false } : undefined });
await c.connect();
try {
  for (const r of rows) {
    const { rows: ex } = await c.query("select id, approved_by_aron from nurture_templates where tenant_id=$1 and key=$2", [tenant, r.key]);
    if (!ex.length) {
      await c.query(
        "insert into nurture_templates (tenant_id,key,subject,preview,body_md,status,approved_by_aron,requires_asset,source_path,created_at,updated_at) values ($1,$2,$3,$4,$5,'proposal',false,$6,$7,now(),now())",
        [tenant, r.key, r.subject, r.preview, r.bodyMd, r.requiresAsset, r.sourcePath]);
      console.log(`inserted ${r.key}`);
    } else if (ex[0].approved_by_aron) {
      console.log(`kept approved ${r.key}`);
    } else {
      await c.query(
        "update nurture_templates set subject=$3,preview=$4,body_md=$5,requires_asset=$6,source_path=$7,updated_at=now() where tenant_id=$1 and key=$2 and approved_by_aron=false",
        [tenant, r.key, r.subject, r.preview, r.bodyMd, r.requiresAsset, r.sourcePath]);
      console.log(`updated ${r.key}`);
    }
  }
} finally { await c.end(); }
