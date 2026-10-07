// One-off, idempotent backfill: rewrites company enum values stored under a
// Hungarian label (or the legacy "F.A.") to the canonical value, in companies
// and in the current company_attributes rows. Tenant-scoped, one audit_log row
// per changed company (actor_agent_id "backfill-company-enums").
// Dry run by default. Usage (from web/):
//   node scripts/backfill-company-enums.mjs --tenant 1 [--apply]
// Reads DIRECT_URL (or DATABASE_URL) from the environment or web/.env.local.
import pg from "pg";
import fs from "node:fs";

const MAP = {
  account_type: { "Ügyfél": "Customer", "Szállító": "Vendor", "Versenytárs": "Competitor" },
  status: { "F.A.": "fa", "Aktív": "active", "Inaktív": "inactive", "Felszámolás alatt": "fa" },
  warmth: { "Hideg": "cold", "Langyos": "warm", "Meleg": "warm", "Forró": "hot" },
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const tenant = Number(args[args.indexOf("--tenant") + 1]);
if (!args.includes("--tenant") || !Number.isInteger(tenant)) {
  console.error("--tenant <id> is required"); process.exit(1);
}

const env = { ...process.env };
if (fs.existsSync(".env.local")) {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}
const url = (env.DIRECT_URL || env.DATABASE_URL || "").replace(/[?&]pgbouncer=true/, "");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN");
  let total = 0;
  for (const [col, map] of Object.entries(MAP)) {
    for (const [from, to] of Object.entries(map)) {
      const rows = (await c.query(
        `SELECT id FROM companies WHERE tenant_id = $1 AND ${col} = $2`, [tenant, from])).rows;
      const attrs = (await c.query(
        `SELECT count(*)::int n FROM company_attributes WHERE tenant_id = $1 AND attr_type = $2 AND value = $3`,
        [tenant, col, from])).rows[0].n;
      if (!rows.length && !attrs) continue;
      console.log(`${col}: "${from}" -> "${to}": ${rows.length} companies, ${attrs} attribute rows`);
      total += rows.length + attrs;
      if (!apply) continue;
      await c.query(`UPDATE companies SET ${col} = $3 WHERE tenant_id = $1 AND ${col} = $2`, [tenant, from, to]);
      await c.query(`UPDATE company_attributes SET value = $4 WHERE tenant_id = $1 AND attr_type = $2 AND value = $3`,
        [tenant, col, from, to]);
      for (const { id } of rows) {
        await c.query(
          `INSERT INTO audit_log (tenant_id, actor_agent_id, action, entity_type, entity_id, changes)
           VALUES ($1, 'backfill-company-enums', 'update', 'company', $2, $3)`,
          [tenant, id, JSON.stringify({ before: { [col]: from }, after: { [col]: to } })]);
      }
    }
  }
  await c.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(`${apply ? "applied" : "dry run"}: ${total} rows ${apply ? "rewritten" : "would be rewritten"} (tenant ${tenant})`);
} catch (e) {
  await c.query("ROLLBACK"); throw e;
} finally {
  await c.end();
}
