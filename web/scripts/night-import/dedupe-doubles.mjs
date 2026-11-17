// Night import follow-up (Kai 2026-11-17): no company gets two first e-mails. Only rows of batch night-2026-11-16:
//  1. a company that is also a budapest-indulas member loses its night member;
//  2. a company in two night campaigns keeps the night-tender member (else the lowest priority number).
// The removed member's person stays on the company (contact created if missing). Undo stays whole: a removed member's
// created_company / created_person flag moves to the kept member, or the person joins the manifest's extra persons.
// Usage (from web/, DATABASE_URL set): node scripts/night-import/dedupe-doubles.mjs <manifest.json> <backup.json> <table.md> [--apply]
// Prints counts only; the table file (outside the repo) holds names for Áron's manual swap in budapest-indulas.
import fs from "node:fs";
import pg from "pg";

const [manifestFile, backupFile, tableFile] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
const BATCH = "night-2026-11-16";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (sql, args = []) => (await c.query(sql, args)).rows;

try {
  await c.query("BEGIN");
  const members = await q(
    `SELECT m.*, c.slug FROM campaign_members m JOIN campaigns c ON c.id = m.campaign_id
     WHERE m.import_batch = $1 AND c.slug LIKE 'night-%' FOR UPDATE OF m`, [BATCH]);
  const bp = new Set((await q(`SELECT m.company_id FROM campaign_members m JOIN campaigns c ON c.id = m.campaign_id WHERE c.slug = 'budapest-indulas'`)).map((r) => r.company_id));

  const byCompany = new Map();
  for (const m of members) byCompany.set(m.company_id, [...(byCompany.get(m.company_id) ?? []), m]);
  const remove = [], transfers = [], bpRows = [];
  for (const [companyId, ms] of byCompany) {
    if (bp.has(companyId)) { for (const m of ms) remove.push({ m, reason: "budapest-indulas", keep: null }); bpRows.push(companyId); continue; }
    if (ms.length < 2) continue;
    const keep = [...ms].sort((a, b) => (a.slug === "night-tender" ? 0 : 1) - (b.slug === "night-tender" ? 0 : 1) || a.priority - b.priority)[0];
    for (const m of ms) if (m !== keep) remove.push({ m, reason: "two-night-campaigns", keep });
  }
  const touched = remove.filter(({ m }) => m.attempts > 0 || m.last_touched_at || m.lead_id);
  if (touched.length) throw new Error(`${touched.length} members to remove were touched; refusing`);

  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const doubles = manifest.campaigns.doubles ?? { extraPersons: [], contacts: [] };
  let contactsCreated = 0, flagsMoved = 0, personsToManifest = 0;
  for (const { m, keep } of remove) {
    // The person stays linked to the company.
    if (m.person_id) {
      const [has] = await q(`SELECT id FROM contacts WHERE tenant_id = $1 AND person_id = $2 AND company_id = $3 AND ended_at IS NULL`, [m.tenant_id, m.person_id, m.company_id]);
      if (!has) {
        contactsCreated++;
        if (apply) {
          const [p] = await q(`SELECT email, phone FROM persons WHERE id = $1`, [m.person_id]);
          const [k] = await q(`INSERT INTO contacts (tenant_id, person_id, company_id, email, phone, created_at) VALUES ($1,$2,$3,$4,$5, now()) RETURNING id`, [m.tenant_id, m.person_id, m.company_id, p.email, p.phone]);
          doubles.contacts.push(k.id);
        }
      }
    }
    // Keep the undo whole.
    if (m.created_company) {
      if (!keep) throw new Error(`member ${m.id} created its company but has no kept member`);
      transfers.push(["created_company", keep.id]);
    }
    if (m.created_person && m.person_id) {
      if (keep && keep.person_id === m.person_id) transfers.push(["created_person", keep.id]);
      else { personsToManifest++; doubles.extraPersons.push(m.person_id); }
    }
  }
  if (apply) {
    for (const [col, id] of transfers) { await q(`UPDATE campaign_members SET ${col} = true WHERE id = $1 AND import_batch = $2`, [id, BATCH]); flagsMoved++; }
    const ids = remove.map(({ m }) => m.id);
    const { rowCount } = await c.query(`DELETE FROM campaign_members WHERE id = ANY($1) AND import_batch = $2 AND attempts = 0 AND last_touched_at IS NULL AND lead_id IS NULL`, [ids, BATCH]);
    if (rowCount !== ids.length) throw new Error(`deleted ${rowCount} of ${ids.length}; rolled back`);
  }

  // Table for Áron: company, the budapest-indulas contact, the best named contact found tonight.
  const lines = ["| company | budapest-indulas contact | named contact found tonight (role, flag) |", "|---|---|---|"];
  for (const companyId of bpRows) {
    const [co] = await q(`SELECT name FROM companies WHERE id = $1`, [companyId]);
    const [bm] = await q(`SELECT p.first_name, p.last_name, k.role FROM campaign_members m JOIN campaigns c ON c.id = m.campaign_id
      LEFT JOIN persons p ON p.id = m.person_id LEFT JOIN contacts k ON k.person_id = m.person_id AND k.company_id = m.company_id AND k.ended_at IS NULL
      WHERE c.slug = 'budapest-indulas' AND m.company_id = $1 LIMIT 1`, [companyId]);
    const bpName = !bm || !bm.first_name ? "none (needs contact)" : bm.first_name === "-" ? `role mailbox${bm.role ? ` (${bm.role})` : ""}` : `${bm.first_name} ${bm.last_name}${bm.role ? `, ${bm.role}` : ""}`;
    const night = byCompany.get(companyId);
    const named = await q(`SELECT p.first_name, p.last_name, k.role, (p.id = ANY($2)) AS is_member FROM contacts k JOIN persons p ON p.id = k.person_id
      WHERE k.company_id = $1 AND k.ended_at IS NULL AND p.deleted_at IS NULL AND p.first_name <> '-' AND (k.created_at >= $3 OR p.id = ANY($2))
      ORDER BY (p.id = ANY($2)) DESC, k.id LIMIT 1`, [companyId, night.map((m) => m.person_id).filter(Boolean), manifest.startedAt]);
    const flag = night.find((m) => named[0] && m.contact_source?.startsWith("personal")) ? "personal" : named[0] ? "personal (extra)" : "";
    const nightName = named[0] ? `${named[0].first_name} ${named[0].last_name}${named[0].role ? `, ${named[0].role}` : ""}, ${flag}` : "no named person (role mailbox only)";
    lines.push(`| ${co.name.replace(/\|/g, "/")} | ${bpName.replace(/\|/g, "/")} | ${nightName.replace(/\|/g, "/")} |`);
  }
  fs.writeFileSync(tableFile, lines.join("\n") + "\n");

  const summary = {
    mode: apply ? "apply" : "dry", membersBefore: members.length,
    removeBudapest: remove.filter((r) => r.reason === "budapest-indulas").length, bpCompanies: bpRows.length,
    removeTwoNight: remove.filter((r) => r.reason === "two-night-campaigns").length,
    removedPerCampaign: Object.fromEntries([...new Set(remove.map(({ m }) => m.slug))].map((s) => [s, remove.filter(({ m }) => m.slug === s).length])),
    contactsCreated, createdFlagsMoved: apply ? flagsMoved : transfers.length, personsAddedToManifest: personsToManifest,
  };
  if (apply) {
    fs.writeFileSync(backupFile, JSON.stringify(remove.map(({ m, reason }) => ({ ...m, removed_reason: reason })), null, 1));
    manifest.campaigns.doubles = doubles;
    await c.query("COMMIT");
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1)); // after commit: the undo list matches the DB
  } else await c.query("ROLLBACK");
  console.log(JSON.stringify(summary, null, 1));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await c.end();
}
