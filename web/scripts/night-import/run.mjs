// Night import 2026-11-16 runner: loads the graded night contacts into DRAFT campaigns through
// lib/campaigns/service (createCampaign, addMembers, undoBatch: the code behind the login-only
// member-load route), then stores each firm's other contacts as persons and contacts on the company.
// Nothing here sends, approves, schedules or runs an automation: the service never does on these paths.
//
// Usage (from web/, DATABASE_URL in .env; contact data stays outside the repo):
//   node scripts/night-import/run.mjs backup <dir>          JSON export of the tables this run writes
//   node scripts/night-import/run.mjs dry <input.json>      creates the empty draft campaigns, dry-runs every load
//   node scripts/night-import/run.mjs apply <input.json> <manifest.json>
//   node scripts/night-import/run.mjs undo <manifest.json> [--apply]   reverse order; dry run without --apply
// input.json = { A: [...], B: [...], fit: {email: {fit, warm}}, opener: {email: text} }.
// Prints counts only, never a name or address.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
// The worktree has no .env: read the main checkout's (NIGHT_ENV_DIR overrides). An already set variable wins.
const envDir = process.env.NIGHT_ENV_DIR ?? web;
for (const f of [".env.local", ".env"]) {
  const p = path.join(envDir, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
delete process.env.ERROR_WEBHOOK_URL; // no external alert from a script run
const jiti = createJiti(import.meta.url, {
  alias: {
    "next/server": path.join(here, "shims/next-server.mjs"),
    "next/headers": path.join(here, "shims/next-headers.mjs"),
    "server-only": path.join(web, "node_modules/next/dist/compiled/server-only/empty.js"),
    "@": path.join(web, "src"),
  },
});

export const BATCH = "night-2026-11-16";
const TENANT = 1;
const ARON = 2; // users.id of Áron (tenants.settings.demoHosts.aron): he ordered this load
const STEPS = [{ channel: "email" }, { channel: "call", wait_days: 3, audience_rule: "no_reply" }]; // same shape as budapest-indulas, no content
const NAMES = {
  "night-contractor": "Éjszakai lista: kivitelezők", "night-engineer": "Éjszakai lista: tervezők, mérnökök",
  "night-fm-owner": "Éjszakai lista: üzemeltetők, tulajdonosok", "night-industry-utility": "Éjszakai lista: ipar, közmű",
  "night-infrastructure": "Éjszakai lista: infrastruktúra", "night-mep": "Éjszakai lista: épületgépészet",
  "night-other": "Éjszakai lista: egyéb (előregyártás, felújítás, fúrás)", "night-tender": "Éjszakai lista: tenderek",
};

const svc = await jiti.import("@/lib/campaigns/service");
const { db } = await jiti.import("@/lib/db");
const { flushAfter } = await jiti.import("next/server");
const { planNightImport, wireRow, NIGHT_CAMPAIGNS } = await jiti.import(path.join(here, "plan.ts"));
const { loadSuppressionSet } = await jiti.import("@/lib/suppression");
const { companyKey, normalizeVat } = await jiti.import("@/lib/import/normalize");
const ctx = { tenantId: TENANT, userId: ARON };

function plan(inputFile) {
  const inp = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  return loadSuppressionSet(TENANT).then((suppressions) =>
    planNightImport(inp.A, inp.B, { fit: new Map(Object.entries(inp.fit)), opener: new Map(Object.entries(inp.opener)), suppressions }));
}

async function ensureCampaigns() {
  const made = [];
  for (const slug of NIGHT_CAMPAIGNS) {
    if (await svc.getCampaign(TENANT, slug)) continue;
    const r = await svc.createCampaign(ctx, { name: NAMES[slug], slug, kind: "sequence", project: "birdsview", steps: STEPS });
    if (!r.ok) throw new Error(`create ${slug}: ${r.error}`);
    if (r.slug !== slug) throw new Error(`slug ${slug} taken, got ${r.slug}`);
    made.push(slug);
  }
  return made;
}

/** Live company index, the keys addMembers resolves by. */
async function companyIndex() {
  const cos = await db.company.findMany({ where: { tenantId: TENANT, deletedAt: null }, select: { id: true, name: true, vatNumber: true, status: true } });
  const byVat = new Map(), byName = new Map();
  for (const c of cos) {
    const v = normalizeVat(c.vatNumber);
    if (v) byVat.set(v, c.id);
    const k = companyKey(c.name);
    if (k && c.status !== "fa" && !byName.has(k)) byName.set(k, c.id);
  }
  return (r) => { const v = normalizeVat(r.vat ?? null); const k = companyKey(r.company_name); return (v ? byVat.get(v) : undefined) ?? (k ? byName.get(k) : undefined) ?? null; };
}

/**
 * Every planned contact of the campaign (member or extra) ends as a person with an active contact on its company,
 * but only on companies this batch made a member of (an open lead's company, a skipped row: untouched).
 * Idempotent: an existing person (by e-mail) or contact is reused, never edited.
 */
async function ensureContacts(slug, rows, dry) {
  const c = await db.campaign.findFirst({ where: { tenantId: TENANT, slug }, select: { id: true } });
  const loaded = new Set((await db.campaignMember.findMany({ where: { tenantId: TENANT, campaignId: c.id, importBatch: BATCH }, select: { companyId: true } })).map((m) => m.companyId));
  const resolve = await companyIndex();
  const res = { persons: [], contacts: [], reusedPersons: 0, notLoaded: 0 };
  const work = async (tx) => {
    for (const r of rows) {
      const companyId = resolve(r);
      if (companyId == null || !loaded.has(companyId)) { res.notLoaded++; continue; }
      let person = await tx.person.findFirst({ where: { tenantId: TENANT, deletedAt: null, email: { equals: r.email, mode: "insensitive" } }, select: { id: true } });
      if (person) res.reusedPersons++;
      else if (dry) { res.persons.push(-1); res.contacts.push(-1); continue; }
      else {
        const [first, ...rest] = (r.person_name ?? "").trim().split(/\s+/).filter(Boolean);
        person = await tx.person.create({ data: { tenantId: TENANT, firstName: first ?? "-", lastName: rest.join(" ") || "-", email: r.email, phone: r.phone ?? null }, select: { id: true } });
        res.persons.push(person.id);
      }
      const has = await tx.contact.findFirst({ where: { tenantId: TENANT, personId: person.id, companyId, endedAt: null }, select: { id: true } });
      if (has) continue;
      if (dry) { res.contacts.push(-1); continue; }
      const k = await tx.contact.create({ data: { tenantId: TENANT, personId: person.id, companyId, role: r.role ?? null, email: r.email, phone: r.phone ?? null }, select: { id: true } });
      res.contacts.push(k.id);
    }
  };
  if (dry) await work(db); else await db.$transaction(work, { timeout: 600_000, maxWait: 30_000 });
  return res;
}

async function dryOrApply(inputFile, manifestFile, apply) {
  const p = await plan(inputFile);
  const made = await ensureCampaigns();
  const t0 = new Date();
  const manifest = { batch: BATCH, startedAt: t0.toISOString(), createdCampaigns: made, order: [], campaigns: {} };
  const report = { mode: apply ? "apply" : "dry", campaignsCreated: made, skippedBeforeLoad: p.skipped, campaigns: {} };
  for (const slug of NIGHT_CAMPAIGNS) {
    const { members, extras } = p.campaigns[slug];
    if (members.length === 0) { report.campaigns[slug] = { planned: 0 }; continue; }
    // Chunks of 60: addMembers' transaction has a 60 s timeout and prod answers in ~90 ms a query (about 5 a row).
    const s = { add: 0, matchedCompanies: 0, newCompanies: 0, newPersons: 0, needsEmail: 0, needsContact: 0, skipped: {} };
    const r = { added: 0 };
    for (let i = 0; i < members.length; i += 60) {
      const part = await svc.addMembers(ctx, slug, { dry_run: !apply, batch: BATCH, rows: members.slice(i, i + 60).map(wireRow) });
      if (!part.ok) throw new Error(`${slug}: ${part.status} ${part.error}`);
      for (const k of ["add", "matchedCompanies", "newCompanies", "newPersons", "needsEmail", "needsContact"]) s[k] += part.summary[k];
      for (const [k, v] of Object.entries(part.summary.skipped)) s.skipped[k] = (s.skipped[k] ?? 0) + v;
      r.added += part.added ?? 0;
    }
    const entry = { plannedMembers: members.length, plannedExtras: extras.length, add: s.add, matchedCompanies: s.matchedCompanies, newCompanies: s.newCompanies, newPersons: s.newPersons, needsEmail: s.needsEmail, needsContact: s.needsContact, skipped: s.skipped };
    if (apply) {
      manifest.order.push(slug);
      const e = await ensureContacts(slug, [...members, ...extras], false);
      // Every contact created since the run started on this batch's companies (service or extras): the undo removes them first.
      const cos = (await db.campaignMember.findMany({ where: { tenantId: TENANT, campaign: { slug }, importBatch: BATCH }, select: { companyId: true } })).map((m) => m.companyId);
      const ks = await db.contact.findMany({ where: { tenantId: TENANT, companyId: { in: cos }, createdAt: { gte: t0 } }, select: { id: true } });
      manifest.campaigns[slug] = { extraPersons: e.persons, contacts: ks.map((k) => k.id) };
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1)); // after every campaign: a crash still leaves an exact undo list
      Object.assign(entry, { added: r.added, extraPersonsCreated: e.persons.length, extraContactsCreated: e.contacts.length, extraPersonsReused: e.reusedPersons, extrasOnSkippedCompany: e.notLoaded });
    } else {
      // Dry: a company not yet created cannot be resolved, so extras on new companies are counted from the plan.
      entry.extrasWouldCreateUpTo = extras.length;
    }
    report.campaigns[slug] = entry;
  }
  await flushAfter();
  console.log(JSON.stringify(report, null, 1));
}

async function undo(manifestFile, apply) {
  const m = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const allContacts = Object.values(m.campaigns).flatMap((c) => c.contacts);
  const extraPersons = Object.values(m.campaigns).flatMap((c) => c.extraPersons);
  const out = { mode: apply ? "undo-apply" : "undo-dry", contactsToDelete: allContacts.length, extraPersonsToSoftDelete: extraPersons.length, campaigns: {} };
  if (apply) {
    // 1. Contacts this run created (hard delete: new rows), so undoBatch sees its own created companies as free.
    await db.contact.deleteMany({ where: { tenantId: TENANT, id: { in: allContacts } } });
    // 2. Extra persons this run created, unless a live contact still links them.
    const linked = new Set((await db.contact.findMany({ where: { tenantId: TENANT, personId: { in: extraPersons }, endedAt: null }, select: { personId: true } })).map((k) => k.personId));
    await db.person.updateMany({ where: { tenantId: TENANT, id: { in: extraPersons.filter((id) => !linked.has(id)) }, deletedAt: null }, data: { deletedAt: new Date() } });
  }
  // 3. The service undo per campaign, last loaded first (a company created by an earlier campaign is then free).
  for (const slug of [...m.order].reverse()) {
    const r = await svc.undoBatch(ctx, slug, BATCH, !apply);
    if (!r.ok) throw new Error(`${slug}: ${r.status} ${r.error}`);
    out.campaigns[slug] = r.summary;
  }
  // 4. The night's draft campaigns, once empty (created by the dry run or the apply, so not only manifest.createdCampaigns).
  if (apply) {
    const empty = [];
    for (const slug of NIGHT_CAMPAIGNS) {
      const c = await db.campaign.findFirst({ where: { tenantId: TENANT, slug, status: "draft" }, select: { id: true, _count: { select: { members: true } } } });
      if (c && c._count.members === 0) { await db.campaign.delete({ where: { id: c.id } }); empty.push(slug); }
    }
    out.campaignsDeleted = empty;
  } else out.campaignsToDeleteIfEmpty = NIGHT_CAMPAIGNS;
  await flushAfter();
  console.log(JSON.stringify(out, null, 1));
}

async function backup(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const tables = ["companies", "persons", "contacts", "campaigns", "campaign_steps", "campaign_members", "campaign_events", "leads", "suppressions", "users", "tenants"];
  for (const t of tables) {
    const [row] = await db.$queryRawUnsafe(`SELECT coalesce(json_agg(t), '[]'::json)::text AS j, count(*)::int AS n FROM ${t} t`);
    fs.writeFileSync(path.join(dir, `${t}.json`), row.j);
    console.log(`${t}: ${row.n} rows`);
  }
}

const [mode, a1, a2] = process.argv.slice(2);
try {
  // Warm the pool (3 connections): a cold connect to prod takes 2-3 s, longer than a transaction's default 2 s wait.
  await Promise.all([1, 2, 3].map(() => db.$queryRaw`SELECT 1`));
  if (mode === "backup") await backup(a1);
  else if (mode === "dry") await dryOrApply(a1, null, false);
  else if (mode === "apply") await dryOrApply(a1, a2, true);
  else if (mode === "undo") await undo(a1, process.argv.includes("--apply"));
  else throw new Error("mode: backup | dry | apply | undo");
} finally {
  await db.$disconnect();
}
