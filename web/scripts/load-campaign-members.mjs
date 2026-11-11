// Load a launch-list file into a campaign as prospects (members), through the CRM API, so the
// dedupe, suppressions and open-lead rule of POST /api/campaigns/:slug/members apply. No lead is
// created and no message is sent. Contact data stays in the file you point at: this repo never
// stores it (the builder's file lives in workspace/labs/launch-list/data, gitignored).
//
// Usage (from web/):
//   CRM_URL=https://ndt-crm.vercel.app CRM_KEY=helm_xxx \
//   node scripts/load-campaign-members.mjs --file <path.json> --campaign <slug> --batch <id>            # dry run (default)
//   ... --apply                    # writes; on a running campaign this sends it back to draft (Áron re-approves)
//   ... --undo                     # dry run of the undo for --batch; add --apply to remove untouched members
//   ... --include-lost             # keep rows the builder marked crm_lost (default: skipped)
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
    // Péter's own network: he phones them; no e-mail step (Áron, 2026-11-11).
    phone_only: r.owner === "Péter call",
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

async function call(method, path, body) {
  const base = process.env.CRM_URL;
  const key = process.env.CRM_KEY;
  if (!base || !key) throw new Error("CRM_URL and CRM_KEY are required");
  const res = await fetch(new URL(path, base), {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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
    const r = await call("DELETE", `/api/campaigns/${enc}/members?batch=${encodeURIComponent(batch)}&dry_run=${apply ? 0 : 1}`);
    console.log(JSON.stringify({ undo: true, dry_run: r.dry_run, summary: r.summary }, null, 2));
    return;
  }
  const file = arg("file");
  if (!file) { console.error("--file <path.json> is required"); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = selectRows(Array.isArray(raw) ? raw : raw.rows ?? [], { includeLost: flag("include-lost") }).map(mapLaunchRow);
  const total = { rows: rows.length, add: 0, refresh: 0, skip: 0, newCompanies: 0, newPersons: 0, needsContact: 0, skipped: {} };
  // One batch id across chunks: the undo removes the whole load.
  for (let i = 0; i < rows.length; i += 500) {
    const r = await call("POST", `/api/campaigns/${enc}/members`, { dry_run: !apply, batch, rows: rows.slice(i, i + 500) });
    for (const k of ["add", "refresh", "skip", "newCompanies", "newPersons", "needsContact"]) total[k] += r.summary[k];
    for (const [k, v] of Object.entries(r.summary.skipped)) total.skipped[k] = (total.skipped[k] ?? 0) + v;
    if (r.status) total.status = r.status;
  }
  console.log(JSON.stringify({ dry_run: !apply, campaign: slug, batch, ...total }, null, 2));
  if (!apply) console.log("dry run: nothing written (add --apply)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
