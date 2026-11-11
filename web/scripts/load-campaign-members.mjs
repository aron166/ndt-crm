// Load a launch-list file into a campaign as prospects (members), through the CRM API, so the
// dedupe, suppressions and open-lead rule of POST /api/campaigns/:slug/members apply. No lead is
// created and no message is sent. Contact data stays in the file you point at: this repo never
// stores it (the builder's file lives in workspace/labs/launch-list/data, gitignored).
//
// Usage (from web/):
//   CRM_URL=https://ndt-crm.vercel.app CRM_KEY=helm_xxx \
//   node scripts/load-campaign-members.mjs --file <path.json> --campaign <slug> --batch <id>            # dry run (default)
//   ... --undo                     # dry run of the undo for --batch
//   ... --include-lost             # keep rows the builder marked crm_lost (default: skipped)
// Applying a load or an undo is SESSION ONLY (Kai 2026-11-11): an app key gets 403. The apply is
// done by a logged-in admin or manager from the campaign's member-load screen (hub UI, in review), or by this script
// with that person's session cookie instead of a key: CRM_COOKIE='sb-...-auth-token=...' plus
// --apply (CRM_KEY is then ignored). Never put a cookie in a file in this repo.
// Prints counts only, never a name, phone or e-mail. mapLaunchRow is pure (tested).
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const clip = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);

/** One builder row (labs/launch-list build.py) -> the members wire row. */
export function mapLaunchRow(r) {
  const id = Number(r.crm_company_id);
  const email = clip(r.email, 200);
  return {
    ...(Number.isInteger(id) && id > 0 ? { crm_company_id: id } : {}),
    company_name: clip(r.crm_name, 200) ?? clip(r.company, 200) ?? "?",
    vat: clip(r.vat8 == null ? undefined : String(r.vat8), 20),
    city: clip(r.city, 100),
    website: clip(r.website, 300),
    person_name: clip(r.contact_name, 120),
    role: clip(r.contact_role, 120),
    phone: clip(r.phone == null ? undefined : String(r.phone), 40),
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined,
    tier: clip(r.tier, 2),
    lane: clip(r.lane, 40),
    // No phone-only exception: Péter's own clients get the e-mail first too (Áron, 2026-11-11).
    why: clip(r.why, 300),
    ...(Number.isInteger(Number(r.rank)) && Number(r.rank) >= 0 ? { priority: Math.min(1000, Number(r.rank)) } : {}),
  };
}

export function selectRows(rows, { includeLost = false } = {}) {
  return rows.filter((r) => includeLost || !r.crm_lost);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

/**
 * Auth for a call: a write (apply) needs a person's session; a dry run may use an app key.
 * @param {boolean} write
 * @param {Record<string, string | undefined>} [env]
 */
export function authHeaders(write, env = process.env) {
  if (write) {
    if (!env.CRM_COOKIE) throw new Error("--apply is session only: set CRM_COOKIE to a logged-in admin's session (an app key gets 403)");
    return { Cookie: env.CRM_COOKIE };
  }
  if (env.CRM_COOKIE) return { Cookie: env.CRM_COOKIE };
  if (!env.CRM_KEY) throw new Error("CRM_KEY (or CRM_COOKIE) is required");
  return { Authorization: `Bearer ${env.CRM_KEY}` };
}

async function call(method, path, body, write) {
  const base = process.env.CRM_URL;
  if (!base) throw new Error("CRM_URL is required");
  const res = await fetch(new URL(path, base), {
    method,
    headers: { ...authHeaders(write), "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${out.error ?? ""}`);
  return out;
}

async function main() {
  const slug = arg("campaign");
  const batch = arg("batch");
  const apply = flag("apply");
  if (!slug || !batch || !/^[A-Za-z0-9_-]{1,64}$/.test(batch)) {
    console.error("--campaign <slug> and --batch <id> are required");
    process.exit(1);
  }
  const enc = encodeURIComponent(slug);
  if (flag("undo")) {
    const r = await call("DELETE", `/api/campaigns/${enc}/members?batch=${encodeURIComponent(batch)}&dry_run=${apply ? 0 : 1}`, undefined, apply);
    console.log(JSON.stringify({ undo: true, dry_run: r.dry_run, summary: r.summary }, null, 2));
    return;
  }
  const file = arg("file");
  if (!file) { console.error("--file <path.json> is required"); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = selectRows(Array.isArray(raw) ? raw : raw.rows ?? [], { includeLost: flag("include-lost") }).map(mapLaunchRow);
  const total = { rows: rows.length, add: 0, refresh: 0, skip: 0, newCompanies: 0, newPersons: 0, needsContact: 0, needsEmail: 0, skipped: {} };
  // One batch id across chunks: the undo removes the whole load.
  for (let i = 0; i < rows.length; i += 500) {
    const r = await call("POST", `/api/campaigns/${enc}/members`, { dry_run: !apply, batch, rows: rows.slice(i, i + 500) }, apply);
    for (const k of ["add", "refresh", "skip", "newCompanies", "newPersons", "needsContact", "needsEmail"]) total[k] += r.summary[k] ?? 0;
    for (const [k, v] of Object.entries(r.summary.skipped)) total.skipped[k] = (total.skipped[k] ?? 0) + v;
    if (r.status) total.status = r.status;
  }
  console.log(JSON.stringify({ dry_run: !apply, campaign: slug, batch, ...total }, null, 2));
  if (!apply) console.log("dry run: nothing written (apply from the campaign's member-load screen, or --apply with CRM_COOKIE)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
