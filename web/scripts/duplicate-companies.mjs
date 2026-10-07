// Read-only duplicate-company report. Groups live (not soft-deleted) companies of
// one tenant by (a) normalized VAT core, (b) companyKey, (c) website domain, and
// prints a markdown report of every group with 2+ members. No --apply: merging is
// a separate, reviewed step. Usage (from web/):
//   node scripts/duplicate-companies.mjs --tenant 1 [--out ../docs/reports/x.md]
// Reads DIRECT_URL (or DATABASE_URL) from the environment or web/.env.local.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { companyKey, normalizeVat, normalizeWebsite } from "../src/lib/import/normalize.ts";

// ponytail: shared hosts that never identify a company; extend when the report shows more
const SHARED_DOMAINS = new Set(["facebook.com", "gmail.com", "google.com", "linkedin.com", "freemail.hu", "sites.google.com"]);

export function domainOf(website) {
  const w = normalizeWebsite(website);
  if (!w) return null;
  const host = new URL(w).hostname.replace(/^www\./, "");
  return SHARED_DOMAINS.has(host) ? null : host;
}

const linked = (r) => r.contacts + r.leads + r.deals + r.tasks;

/** rows: {id,name,vat_number,website,created_at,contacts,leads,deals,tasks,...}. Returns {vat,key,domain} -> groups. */
export function groupDuplicates(rows) {
  const keyers = {
    vat: (r) => normalizeVat(r.vat_number),
    key: (r) => companyKey(r.name) || null,
    domain: (r) => domainOf(r.website),
  };
  const out = {};
  for (const [method, fn] of Object.entries(keyers)) {
    const by = new Map();
    for (const r of rows) {
      const k = fn(r);
      if (k) by.set(k, [...(by.get(k) || []), r]);
    }
    out[method] = [...by.entries()]
      .filter(([, m]) => m.length > 1)
      .map(([k, m]) => {
        const members = [...m].sort((a, b) =>
          linked(b) - linked(a) || new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
        return {
          method, key: k, members, survivor: members[0].id,
          linked: members.reduce((s, r) => s + linked(r), 0),
          // dangerous: a merge would move leads or deals from more than one member
          split: members.filter((r) => r.leads + r.deals > 0).length > 1,
          // members carry different VAT cores: likely distinct legal entities, not duplicates
          vatConflict: new Set(members.map((r) => normalizeVat(r.vat_number)).filter(Boolean)).size > 1,
        };
      })
      .sort((a, b) => b.linked - a.linked || a.key.localeCompare(b.key));
  }
  return out;
}

export function renderReport(groups, tenant, date) {
  const all = Object.values(groups).flat();
  const ids = new Set(all.flatMap((g) => g.members.map((r) => r.id)));
  const L = [`# Duplicate companies, tenant ${tenant}, ${date}`, "",
    "Read-only report from `web/scripts/duplicate-companies.mjs`. Live companies only (soft-deleted excluded).",
    "Survivor = most linked records (contacts + leads + deals + tasks), then oldest. Split = more than one member owns leads or deals.",
    "VAT CONFLICT = members carry different VAT cores, so they are likely distinct legal entities; verify before any merge.", "",
    "| Method | Groups | Split groups | VAT conflict groups |", "|---|---|---|---|"];
  for (const [m, gs] of Object.entries(groups)) L.push(`| ${m} | ${gs.length} | ${gs.filter((g) => g.split).length} | ${gs.filter((g) => g.vatConflict).length} |`);
  L.push("", `Distinct companies involved: ${ids.size}`, "");
  const esc = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ");
  for (const [m, gs] of Object.entries(groups)) {
    L.push(`## By ${m} (${gs.length})`, "");
    for (const g of gs) {
      L.push(`### ${esc(g.key)}${g.split ? " (SPLIT)" : ""}${g.vatConflict ? " (VAT CONFLICT)" : ""}, survivor ${g.survivor}, linked ${g.linked}`, "",
        "| id | name | status | account_type | VAT | website | created | contacts | leads | deals | tasks | notes len |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|");
      for (const r of g.members) L.push(`| ${r.id} | ${esc(r.name)} | ${esc(r.status)} | ${esc(r.account_type)} | ${esc(r.vat_number)} | ${esc(r.website)} | ${new Date(r.created_at).toISOString().slice(0, 10)} | ${r.contacts} | ${r.leads} | ${r.deals} | ${r.tasks} | ${r.notes_len} |`);
      L.push("");
    }
  }
  return L.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const tenant = Number(args[args.indexOf("--tenant") + 1]);
  if (!args.includes("--tenant") || !Number.isInteger(tenant)) { console.error("--tenant <id> is required"); process.exit(1); }
  const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const env = { ...process.env };
  if (fs.existsSync(".env.local")) {
    for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
      const i = l.indexOf("=");
      if (i > 0 && !l.startsWith("#")) env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  }
  const { default: pg } = await import("pg");
  const url = (env.DIRECT_URL || env.DATABASE_URL || "").replace(/[?&]pgbouncer=true/, "");
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const cnt = (t) => `(SELECT count(*)::int FROM ${t} x WHERE x.tenant_id = c.tenant_id AND x.company_id = c.id)`;
    const { rows } = await c.query(
      `SELECT c.id, c.name, c.status, c.account_type, c.vat_number, c.website, c.created_at,
              coalesce(length(c.notes), 0) notes_len,
              ${cnt("contacts")} contacts, ${cnt("leads")} leads, ${cnt("deals")} deals, ${cnt("tasks")} tasks
         FROM companies c WHERE c.tenant_id = $1 AND c.deleted_at IS NULL`, [tenant]);
    await c.query("ROLLBACK");
    const md = renderReport(groupDuplicates(rows), tenant, new Date().toISOString().slice(0, 10)) +
      `\nScanned ${rows.length} live companies: ${rows.filter((r) => normalizeVat(r.vat_number)).length} with a usable VAT, ${rows.filter((r) => domainOf(r.website)).length} with a usable website domain.`;
    console.log(md);
    if (outPath) fs.writeFileSync(outPath, md + "\n");
  } finally {
    await c.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
