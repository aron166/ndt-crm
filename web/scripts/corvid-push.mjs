// One-shot sync of Corvid leads into the CRM email draft queue. Creates/matches company, person and contact,
// then one status='draft' EmailDraft per row for the sender to approve and hand-send. Nothing is sent.
// Usage (from web/):
//   node scripts/corvid-push.mjs --in rows.json [--dry-run] [--tenant 1] [--sender 3] [--campaign corvid-betonscan-w1]
// Reads DIRECT_URL (or DATABASE_URL) from the environment or web/.env.local. All inserts run in ONE transaction.
// planPush is pure (tested without a database); loadCrm reads; applyPlan writes.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { companyKey, normalizeName, normalizeVat } from "../src/lib/import/normalize.ts";
import { isSuppressed } from "../src/lib/suppression/match.ts";
import { domainOf } from "./duplicate-companies.mjs";

const OTHER_OPEN = new Set(["draft", "approved", "sending", "sent", "replied"]);
// Mirror of lib/outreach/drafts.ts withFooter (extensionless imports cannot load under plain Node); parity-tested.
const FOOTER_SEPARATOR = "\n\n-- \n";
export function withFooter(body, footer) {
  const trimmedBody = body.replace(/\s+$/, "");
  const trimmedFooter = footer?.trim();
  if (!trimmedFooter) return trimmedBody;
  if (trimmedBody.endsWith(`${FOOTER_SEPARATOR}${trimmedFooter}`)) return trimmedBody;
  return `${trimmedBody}${FOOTER_SEPARATOR}${trimmedFooter}`;
}

/** Mirror of lib/outreach/template.ts gateOn over a content_items row {title,status,live_version_id} or null. */
export function gateOn(row) {
  if (!row) return { ok: true };
  const live = row.status === "live" ? row.live_version_id : null;
  if (live === null || live === undefined) return { ok: false, error: `A sablon még nincs jóváhagyva: ${row.title}` };
  return { ok: true };
}

const HONORIFICS = { dr: "Dr.", ifj: "ifj.", id: "id.", prof: "Prof.", doc: "Doc." };

/** Hungarian order: family name first, given name = last token. Honorifics are removed wherever they stand. */
export function splitPerson(full) {
  const honorifics = [];
  const toks = (full || "").trim().split(/\s+/).filter(Boolean).filter((t) => {
    const h = HONORIFICS[t.toLowerCase().replace(/\.$/, "")];
    if (h) { if (!honorifics.includes(h)) honorifics.push(h); return false; }
    return true;
  });
  if (!toks.length) return { first_name: "", last_name: "-", honorifics };
  if (toks.length === 1) return { first_name: toks[0], last_name: "-", honorifics };
  return { first_name: toks[toks.length - 1], last_name: toks.slice(0, -1).join(" "), honorifics };
}

// Mirror of growth packs/betonscan/pack.py is_mobile: +36 20/30/31/50/70 in any of 0036, +36, bare 36, 06 or national form.
const MOBILE = new Set(["20", "30", "31", "50", "70"]);
export function isMobile(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  d = d.startsWith("0036") ? d.slice(4) : d.startsWith("06") || (d.startsWith("36") && d.length > 9) ? d.slice(2) : d;
  return MOBILE.has(d.slice(0, 2));
}
// A named person's mobile is personal data: never written to persons or contacts (Aron's call pending). Landlines pass.
const officePhone = (phone) => (phone && !isMobile(phone) ? phone : null);

const nameKey = (first, last) => normalizeName(`${first} ${last}`).split(" ").filter(Boolean).sort().join(" ");
const day = (s) => (s || "").slice(0, 10);

function noteLine(p) {
  return `Corvid: ${p.title || "-"}; forrás: ${p.source || "-"} ${p.source_url || ""} (${day(p.retrieved_at)})`.replace(/\s+\(/, " (");
}

/**
 * Pure planner. rows in export order (decision makers first); the first row resolving to a company wins.
 * crm = {companies, persons, contacts, drafts, suppression, gate, footer}; opts = {tenant, sender, campaign}.
 * New entities carry a `ref`; links to existing ones carry `*_id`, links to planned ones `*_ref`.
 * @returns {any}
 */
// Only Corvid's betonscan workspace may reach the CRM (Aron, 2026-10-19). A row without the stamp, or from any other
// workspace, refuses the whole push before anything is planned or written.
export const CRM_WORKSPACE = "betonscan";
export function assertWorkspace(rows) {
  const bad = rows.filter((r) => r?.workspace !== CRM_WORKSPACE);
  if (bad.length) throw new Error(`refusing push: ${bad.length} row(s) not from Corvid workspace ${CRM_WORKSPACE}`);
}

export function planPush(rows, crm, opts) {
  assertWorkspace(rows);
  const { campaign, sender } = opts;
  /** @type {any} */
  const plan = {
    companies: { matched: [], create: [], skipped: [] },
    persons: { matched: [], create: [], update: [] },
    contacts: { create: [] },
    drafts: { create: [], skipped: [] },
    already: 0,
  };
  const byVat = new Map(), byKey = new Map(), byDomain = new Map();
  for (const c of crm.companies) {
    const v = normalizeVat(c.vat_number), k = companyKey(c.name), d = domainOf(c.website);
    if (v && !byVat.has(v)) byVat.set(v, c);
    if (k && !byKey.has(k)) byKey.set(k, c);
    if (d && !byDomain.has(d)) byDomain.set(d, c);
  }
  // "TERRA-21. KFT." vs "TERRA-21. Közmű és Mélyépítő Kft.": one key a prefix of the other is a possible duplicate.
  // Without a VAT number to prove otherwise we skip it rather than create a second company.
  const near = (k, key) => k && k.length >= 5 && (k.startsWith(key) || key.startsWith(k));
  const prefixOf = (key) => key && key.length >= 5
    ? crm.companies.find((c) => near(companyKey(c.name), key))
      || plan.companies.create.find((c) => near(companyKey(c.name), key)) || null
    : null;
  // a person already in another open or sent campaign is not drafted again, whatever company they sit at
  const openPeople = new Set(), openEmails = new Set();
  for (const d of crm.drafts) {
    if (d.campaign === campaign || !OTHER_OPEN.has(d.status)) continue;
    if (d.person_id) openPeople.add(d.person_id);
    if (d.to_email) openEmails.add(d.to_email.toLowerCase());
  }
  const deletedVats = new Set((crm.deletedVats || []).map(normalizeVat).filter(Boolean));
  const deletedEmails = new Set((crm.deletedEmails || []).map((e) => e.toLowerCase()));
  const personByEmail = new Map(crm.persons.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const personById = new Map(crm.persons.map((p) => [p.id, p]));
  const linked = new Set(crm.contacts.map((c) => `${c.person_id}:${c.company_id}`));
  const draftsBy = new Map();
  for (const d of crm.drafts) draftsBy.set(d.company_id, [...(draftsBy.get(d.company_id) || []), d]);
  const seen = new Set(); // vat:/key: of every company already resolved in this input
  const newPersonByEmail = new Map(), noteTouched = new Map();
  let nc = 0, np = 0;

  for (const row of rows) {
    const name = row.company_name, p = row.person || {};
    const vat = normalizeVat(row.adoszam), key = companyKey(name);
    const skipCompany = (reason) => plan.companies.skipped.push({ name, lead_id: row.lead_id, reason });
    const skipDraft = (reason) => plan.drafts.skipped.push({ name, lead_id: row.lead_id, email: p.email || null, reason });

    if (!crm.gate.ok) { skipDraft(crm.gate.error); continue; }
    if (!p.email) { skipDraft("no email"); continue; }
    if (isSuppressed(p.email, crm.suppression)) { skipDraft("suppressed"); continue; }

    const dom = domainOf(row.website);
    const byName = (key && byKey.get(key)) || (dom && byDomain.get(dom)) || null;
    const existing = (vat && byVat.get(vat)) || byName;
    if (existing && vat && normalizeVat(existing.vat_number) && normalizeVat(existing.vat_number) !== vat) {
      skipCompany(`VAT differs from company ${existing.id}`); continue;
    }
    if (!existing && vat && deletedVats.has(vat)) { skipCompany("VAT on a deleted company"); continue; }
    if (deletedEmails.has(p.email.toLowerCase())) { skipDraft("person soft-deleted"); continue; }
    if (openEmails.has(p.email.toLowerCase())) { skipDraft("person in open campaign"); continue; }
    const keys = [vat && `v:${vat}`, key && `k:${key}`, dom && `d:${dom}`, `e:${p.email.toLowerCase()}`,
      existing && `id:${existing.id}`].filter(Boolean);
    if (keys.some((k) => seen.has(k))) { skipCompany("duplicate in input"); continue; }
    if (!existing && !vat) {
      const near = prefixOf(key);
      if (near) { skipCompany(`possible duplicate of company ${near.id ?? near.ref} (${near.name})`); keys.forEach((k) => seen.add(k)); continue; }
    }
    if (existing) {
      const ds = draftsBy.get(existing.id) || [];
      if (ds.some((d) => d.campaign === campaign && d.step === 1)) { plan.already++; keys.forEach((k) => seen.add(k)); continue; }
      if (ds.some((d) => d.campaign !== campaign && OTHER_OPEN.has(d.status))) { skipCompany("open campaign"); keys.forEach((k) => seen.add(k)); continue; }
    }
    // person resolved before anything is planned: a person in another open campaign skips the whole row
    const sp = splitPerson(p.name);
    const email = p.email.toLowerCase();
    let found = personByEmail.get(email);
    if (!found && existing) {
      const nk = nameKey(sp.first_name, sp.last_name);
      found = crm.persons.find((x) => nameKey(x.first_name, x.last_name) === nk && linked.has(`${x.id}:${existing.id}`));
    }
    if (found && openPeople.has(found.id)) { skipDraft("person in open campaign"); keys.forEach((k) => seen.add(k)); continue; }
    keys.forEach((k) => seen.add(k));

    // company
    let co;
    if (existing) {
      co = { id: existing.id };
      plan.companies.matched.push({ id: existing.id, name: existing.name, lead_id: row.lead_id });
    } else {
      co = { ref: `c${++nc}` };
      plan.companies.create.push({
        ref: co.ref, name, vat_number: vat, website: row.website || null, city: row.city || null,
        account_type: "Lead", lead_source: "corvid", notes: `Corvid lead ${row.lead_id}, pontszám ${row.score}`,
      });
    }

    // person
    const note = noteLine(p) + (sp.honorifics.length ? `\nMegszólítás: ${sp.honorifics.join(" ")}` : "");
    let per = null;
    if (found) {
      per = { id: found.id };
      plan.persons.matched.push({ id: found.id, name: p.name });
      const cur = noteTouched.get(found.id) ?? found.notes ?? "";
      if (p.source_url && !cur.includes(p.source_url)) {
        const next = cur ? `${cur}\n${noteLine(p)}` : noteLine(p);
        noteTouched.set(found.id, next);
        const u = plan.persons.update.find((x) => x.id === found.id);
        if (u) u.notes = next; else plan.persons.update.push({ id: found.id, notes: next });
      }
    } else if (newPersonByEmail.has(email)) {
      per = { ref: newPersonByEmail.get(email) };
    } else {
      per = { ref: `p${++np}` };
      newPersonByEmail.set(email, per.ref);
      plan.persons.create.push({
        ref: per.ref, first_name: sp.first_name, last_name: sp.last_name, email: p.email, phone: officePhone(p.phone),
        linkedin_url: p.linkedin || null, notes: note,
      });
    }

    // contact
    const hasLink = per.id && co.id && linked.has(`${per.id}:${co.id}`);
    if (!hasLink) {
      plan.contacts.create.push({
        person_id: per.id ?? null, person_ref: per.ref ?? null, company_id: co.id ?? null, company_ref: co.ref ?? null,
        role: p.title || null, email: p.email, phone: officePhone(p.phone), is_primary: false,
      });
    }

    plan.drafts.create.push({
      company_id: co.id ?? null, company_ref: co.ref ?? null, person_id: per.id ?? null, person_ref: per.ref ?? null,
      campaign, step: 1, subject: row.subject, body: withFooter(row.body, crm.footer), to_email: p.email,
      status: "draft", sender_user_id: sender, wave: 1, name, lead_id: row.lead_id,
    });
  }
  return plan;
}

export async function loadCrm(client, tenant, campaign) {
  const q = async (sql, args = []) => (await client.query(sql, args)).rows;
  const sup = await q("select email, domain from suppressions where tenant_id = $1", [tenant]);
  const item = (await q(
    "select title, status, live_version_id from content_items where tenant_id = $1 and outreach_campaign = $2 and outreach_step = 1 limit 1",
    [tenant, campaign]))[0] || null;
  const ten = (await q("select settings from tenants where id = $1", [tenant]))[0];
  const footer = typeof ten?.settings?.outreachFooter === "string" ? ten.settings.outreachFooter : null;
  return {
    companies: await q("select id, name, vat_number, website from companies where tenant_id = $1 and deleted_at is null", [tenant]),
    persons: await q("select id, first_name, last_name, email, notes from persons where tenant_id = $1 and deleted_at is null", [tenant]),
    contacts: await q("select person_id, company_id, role from contacts where tenant_id = $1", [tenant]),
    drafts: await q("select company_id, campaign, status, step, person_id, to_email from email_drafts where tenant_id = $1", [tenant]),
    // the unique VAT index still covers soft-deleted companies; a deleted person's email is not re-created
    deletedVats: (await q("select vat_number from companies where tenant_id = $1 and deleted_at is not null and vat_number is not null", [tenant])).map((r) => r.vat_number),
    deletedEmails: (await q("select email from persons where tenant_id = $1 and deleted_at is not null and email is not null", [tenant])).map((r) => r.email),
    suppression: {
      emails: new Set(sup.filter((s) => s.email).map((s) => s.email.toLowerCase())),
      domains: new Set(sup.filter((s) => s.domain).map((s) => s.domain.toLowerCase())),
    },
    gate: gateOn(item),
    footer,
  };
}

/** All inserts in ONE transaction; ROLLBACK on any error. Returns counts. */
export async function applyPlan(client, plan, opts) {
  const t = opts.tenant, ids = { c: new Map(), p: new Map() };
  const n = { companies: 0, persons: 0, notes: 0, contacts: 0, drafts: 0 };
  const ok = await client.query("select 1 from users where id = $1 and tenant_id = $2", [opts.sender, t]);
  if (!ok.rowCount) throw new Error(`sender user ${opts.sender} is not a user of tenant ${t}`);
  const audit = (entity, id, after, before = null, action = "create") => client.query(
    `insert into audit_log (tenant_id, actor_agent_id, action, entity_type, entity_id, changes, occurred_at)
     values ($1, 'corvid-push', $5, $2, $3, $4, now())`, [t, entity, id, JSON.stringify({ before, after }), action]);
  await client.query("BEGIN");
  try {
    for (const c of plan.companies.create) {
      const r = await client.query(
        `insert into companies (tenant_id, name, vat_number, website, city, account_type, lead_source, notes, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) returning id`,
        [t, c.name, c.vat_number, c.website, c.city, c.account_type, c.lead_source, c.notes]);
      ids.c.set(c.ref, r.rows[0].id); n.companies++;
      await audit("company", r.rows[0].id, { name: c.name, vatNumber: c.vat_number, leadSource: c.lead_source });
    }
    for (const p of plan.persons.create) {
      const r = await client.query(
        `insert into persons (tenant_id, first_name, last_name, email, phone, linkedin_url, notes, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,now(),now()) returning id`,
        [t, p.first_name, p.last_name, p.email, p.phone, p.linkedin_url, p.notes]);
      ids.p.set(p.ref, r.rows[0].id); n.persons++;
      await audit("person", r.rows[0].id, { firstName: p.first_name, lastName: p.last_name, email: p.email });
    }
    for (const u of plan.persons.update) {
      const old = await client.query("select notes from persons where id = $1 and tenant_id = $2 for update", [u.id, t]);
      if (!old.rowCount) throw new Error(`person ${u.id} is not in tenant ${t}`);
      await client.query("update persons set notes = $1, updated_at = now() where id = $2 and tenant_id = $3", [u.notes, u.id, t]);
      n.notes++;
      await audit("person", u.id, { notes: u.notes }, { notes: old.rows[0].notes }, "update");
    }
    const cid = (x) => x.company_id ?? ids.c.get(x.company_ref), pid = (x) => x.person_id ?? ids.p.get(x.person_ref);
    for (const c of plan.contacts.create) {
      const r = await client.query(
        `insert into contacts (tenant_id, person_id, company_id, role, email, phone, is_primary, created_at)
         values ($1,$2,$3,$4,$5,$6,false,now()) returning id`,
        [t, pid(c), cid(c), c.role, c.email, c.phone]);
      n.contacts++;
      await audit("contact", r.rows[0].id, { personId: pid(c), companyId: cid(c), role: c.role, email: c.email, phone: c.phone });
    }
    for (const d of plan.drafts.create) {
      const r = await client.query(
        `insert into email_drafts (tenant_id, company_id, person_id, campaign, step, subject, body, to_email, status,
           sender_user_id, wave, created_by, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,NULL,now(),now())
         returning id`,
        [t, cid(d), pid(d), d.campaign, d.step, d.subject, d.body, d.to_email, d.sender_user_id, d.wave]);
      n.drafts += 1;  // no ON CONFLICT: a clash is a planning bug and rolls the whole run back
      await audit("email_draft", r.rows[0].id, { companyId: cid(d), campaign: d.campaign, step: d.step, status: "draft", senderUserId: d.sender_user_id });
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
  return n;
}

export function summary(plan) {
  const s = plan.companies.skipped.reduce((m, x) => ({ ...m, [x.reason]: (m[x.reason] || 0) + 1 }), {});
  const d = plan.drafts.skipped.reduce((m, x) => ({ ...m, [x.reason]: (m[x.reason] || 0) + 1 }), {});
  return [
    `companies: ${plan.companies.matched.length} matched, ${plan.companies.create.length} to create, ${plan.companies.skipped.length} skipped ${JSON.stringify(s)}`,
    `persons: ${plan.persons.matched.length} matched, ${plan.persons.create.length} to create, ${plan.persons.update.length} notes appended`,
    `contacts: ${plan.contacts.create.length} to create`,
    `drafts: ${plan.drafts.create.length} to create, ${plan.drafts.skipped.length} skipped ${JSON.stringify(d)}, ${plan.already} already drafted`,
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const file = arg("--in");
  if (!file) { console.error("usage: node scripts/corvid-push.mjs --in rows.json [--dry-run] [--tenant 1] [--sender 3] [--campaign x]"); process.exit(1); }
  const opts = { tenant: Number(arg("--tenant", 1)), sender: Number(arg("--sender", 3)), campaign: arg("--campaign", "corvid-betonscan-w1") };
  const dry = args.includes("--dry-run");
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  assertWorkspace(rows);
  const envFile = new URL("../.env.local", import.meta.url);
  const env = { ...process.env };
  if (fs.existsSync(envFile)) {
    for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
      const i = l.indexOf("=");
      if (i > 0 && !l.startsWith("#")) env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  }
  const { default: pg } = await import("pg");
  const raw = env.DIRECT_URL || env.DATABASE_URL || "";
  let url = raw;
  if (raw) { const u = new URL(raw); u.searchParams.delete("pgbouncer"); u.searchParams.delete("sslmode"); url = u.toString(); }
  if (!url) { console.error("DIRECT_URL or DATABASE_URL is required"); process.exit(1); }
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const plan = planPush(rows, await loadCrm(c, opts.tenant, opts.campaign), opts);
    console.log(summary(plan));
    if (dry) {
      for (const [k, v] of Object.entries({ companies: plan.companies.create, persons: plan.persons.create, "persons.update": plan.persons.update,
        contacts: plan.contacts.create, drafts: plan.drafts.create })) for (const x of v) console.log(`INSERT ${k}`, JSON.stringify(x));
      for (const x of [...plan.companies.skipped, ...plan.drafts.skipped]) console.log("SKIP", JSON.stringify(x));
      console.log("dry run: nothing written");
    } else {
      console.log("applied:", JSON.stringify(await applyPlan(c, plan, opts)));
    }
  } finally {
    await c.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
