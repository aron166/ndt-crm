/**
 * Seed BirdsView / BetonScan target accounts into the CRM.
 *
 * Source: a CSV of 91 target organizations for the GPR launch
 * (cols: num,name,segment,top10,q4_loi,in_crm,crm_name,dm_role,why_now,website,source).
 *
 * What it does (idempotent — safe to re-run):
 *   - matches each row to an existing Company by case- and accent-insensitive
 *     name (tries crm_name, then name, then legal-suffix-stripped variants);
 *   - creates the missing companies (name, website, status active) — never
 *     overwrites a field on a matched company;
 *   - tags all 91 with `birdsview-target`, the segment tag, plus `bv-top10`
 *     / `bv-q4-loi` where flagged (reuses tags/taggings; creates tags if missing);
 *   - appends a delimited "BirdsView target intel" block (dm_role / why_now /
 *     source) to company.notes, once;
 *   - writes an audit_log row for company CREATES only.
 *
 * Writes go through raw `pg` (the etl already depends on it). The etl Prisma
 * client predates the tags/audit tables, so SQL is the robust path here.
 *
 * Run:  npm run seed:birdsview-targets [-- --dry-run] [-- --file <path>] [-- --tenant-id 1]
 * The DB target is DIRECT_URL (or DATABASE_URL) from web/.env unless SEED_DATABASE_URL is set.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

// Load env: etl/.env first, then web/.env as fallback (dotenv won't override
// values already set, so an explicit shell env wins over both).
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', 'web', '.env') });

const DEFAULT_CSV = 'C:\\Users\\Áron\\machines\\birdsview\\target-accounts.csv';

interface Args { dryRun: boolean; tenantId: number; file: string; }

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { dryRun: false, tenantId: 1, file: DEFAULT_CSV };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dry-run') out.dryRun = true;
    else if (a[i] === '--tenant-id') {
      const raw = a[++i];
      const n = Number(raw);
      if (raw === undefined || !Number.isInteger(n) || n <= 0) {
        throw new Error(`--tenant-id requires a positive integer (got: ${raw ?? '<missing>'})`);
      }
      out.tenantId = n;
    } else if (a[i] === '--file') {
      const raw = a[++i];
      if (!raw || raw.startsWith('--')) {
        throw new Error(`--file requires a path (got: ${raw ?? '<missing>'})`);
      }
      out.file = raw;
    } else {
      throw new Error(`Unknown argument: ${a[i]}`);
    }
  }
  return out;
}

// ── CSV parsing (RFC-4180-ish: quotes, "" escapes, embedded commas/newlines) ──
function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, ''); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore, handled by \n */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

interface TargetRow {
  num: string; name: string; segment: string; top10: boolean; q4_loi: boolean;
  in_crm: string; crm_name: string; dm_role: string; why_now: string;
  website: string; source: string;
}

const REQUIRED_HEADERS = [
  'num', 'name', 'segment', 'top10', 'q4_loi', 'in_crm',
  'crm_name', 'dm_role', 'why_now', 'website', 'source',
];

function toRows(matrix: string[][]): TargetRow[] {
  if (matrix.length === 0) throw new Error('CSV is empty — no rows parsed.');
  const header = matrix[0].map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required column(s): ${missing.join(', ')}. Found: ${header.join(', ')}`,
    );
  }
  const idx = (k: string) => header.indexOf(k);
  const truthy = (v: string) => (v ?? '').trim().toLowerCase() === 'true';
  return matrix.slice(1).map((r) => ({
    num: (r[idx('num')] ?? '').trim(),
    name: (r[idx('name')] ?? '').trim(),
    segment: (r[idx('segment')] ?? '').trim(),
    top10: truthy(r[idx('top10')]),
    q4_loi: truthy(r[idx('q4_loi')]),
    in_crm: (r[idx('in_crm')] ?? '').trim(),
    crm_name: (r[idx('crm_name')] ?? '').trim(),
    dm_role: (r[idx('dm_role')] ?? '').trim(),
    why_now: (r[idx('why_now')] ?? '').trim(),
    website: (r[idx('website')] ?? '').trim(),
    source: (r[idx('source')] ?? '').trim(),
  })).filter((r) => r.name !== '');
}

// ── Name normalisation for matching ──────────────────────────────────────────
function normName(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const LEGAL_SUFFIXES = new Set([
  'zrt', 'kft', 'nyrt', 'kkt', 'bt', 'nonprofit', 'kozhasznu', 'csoport',
  'holding', 'group', 'kozhasznu',
]);

function stripLegalSuffix(norm: string): string {
  let words = norm.split(' ').filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words = words.slice(0, -1);
  }
  return words.join(' ');
}

function normalizeWebsite(raw: string): string | null {
  let s = (raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); return `${u.protocol}//${u.host}`; } catch { return null; }
}

// ── Tags ─────────────────────────────────────────────────────────────────────
const SEGMENT_TAG: Record<string, string> = {
  S1: 'bv-s1-design',
  S2: 'bv-s2-asset-operator',
  S3: 'bv-s3-gc',
  S4: 'bv-s4-cutting-coring',
  S5: 'bv-s5-ndt-lab',
};

const TAG_COLORS: Record<string, string> = {
  'birdsview-target': '#f59e0b',
  'bv-s1-design': '#6366f1',
  'bv-s2-asset-operator': '#8b5cf6',
  'bv-s3-gc': '#0ea5e9',
  'bv-s4-cutting-coring': '#14b8a6',
  'bv-s5-ndt-lab': '#10b981',
  'bv-top10': '#ef4444',
  'bv-q4-loi': '#f97316',
};

function segmentTagName(segment: string): string | null {
  const key = (segment.split('_')[0] || '').toUpperCase().trim();
  return SEGMENT_TAG[key] ?? null;
}

const NOTES_MARKER = '--- BirdsView target intel';

function buildNotesBlock(r: TargetRow): string {
  const lines = ['--- BirdsView target intel (seeded 2026-06-06) ---'];
  if (r.dm_role) lines.push(`DM role: ${r.dm_role}`);
  if (r.why_now) lines.push(`Why now: ${r.why_now}`);
  if (r.source) lines.push(`Source: ${r.source}`);
  const flags = [r.segment, r.top10 ? 'top10' : '', r.q4_loi ? 'q4_loi' : ''].filter(Boolean);
  lines.push(`Segment: ${flags.join(' | ')}`);
  lines.push('---');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const conn = process.env.SEED_DATABASE_URL
    || process.env.DIRECT_URL
    || process.env.DATABASE_URL;
  if (!conn) throw new Error('No DB connection string (set SEED_DATABASE_URL, DIRECT_URL, or DATABASE_URL).');
  const connectionString = conn.replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');

  console.log('\nBirdsView target-account seed');
  console.log(`  file      : ${args.file}`);
  console.log(`  tenant-id : ${args.tenantId}`);
  console.log(`  dry-run   : ${args.dryRun}`);
  console.log(`  db host   : ${(() => { try { return new URL(connectionString).host; } catch { return '?'; } })()}\n`);

  if (!fs.existsSync(args.file)) throw new Error(`CSV not found: ${args.file}`);
  const rows = toRows(parseCsv(fs.readFileSync(args.file, 'utf8')));
  console.log(`Parsed ${rows.length} target rows.\n`);

  const client = new Client({ connectionString });
  await client.connect();

  const summary = {
    matched: 0, created: 0, taggingsAdded: 0, notesAdded: 0,
    skipped: [] as string[],
  };

  try {
    // Verify tenant exists.
    const t = await client.query('SELECT id FROM tenants WHERE id = $1', [args.tenantId]);
    if (t.rowCount === 0) throw new Error(`Tenant id=${args.tenantId} not found.`);

    // Build in-memory match index of existing companies.
    const existing = await client.query<{ id: number; name: string }>(
      'SELECT id, name FROM companies WHERE tenant_id = $1', [args.tenantId],
    );
    const byNorm = new Map<string, { id: number; name: string }>();
    const byStripped = new Map<string, { id: number; name: string }>();
    for (const c of existing.rows) {
      const n = normName(c.name);
      if (n && !byNorm.has(n)) byNorm.set(n, c);
      const sNorm = stripLegalSuffix(n);
      if (sNorm && !byStripped.has(sNorm)) byStripped.set(sNorm, c);
    }
    console.log(`Loaded ${existing.rows.length} existing companies for matching.\n`);

    function findMatch(r: TargetRow): { id: number; name: string } | null {
      const cands = [r.crm_name, r.name].filter(Boolean);
      for (const c of cands) { const hit = byNorm.get(normName(c)); if (hit) return hit; }
      for (const c of cands) { const hit = byStripped.get(stripLegalSuffix(normName(c))); if (hit) return hit; }
      return null;
    }

    // Pre-create all tag definitions; cache ids.
    const tagIds = new Map<string, number>();
    async function ensureTag(name: string): Promise<number> {
      const cached = tagIds.get(name);
      if (cached) return cached;
      if (!args.dryRun) {
        await client.query(
          'INSERT INTO tags (tenant_id, name, color) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, name) DO NOTHING',
          [args.tenantId, name, TAG_COLORS[name] ?? '#6366f1'],
        );
      }
      const res = await client.query<{ id: number }>(
        'SELECT id FROM tags WHERE tenant_id = $1 AND name = $2', [args.tenantId, name],
      );
      const id = res.rows[0]?.id ?? -1;
      tagIds.set(name, id);
      return id;
    }
    if (!args.dryRun) for (const name of Object.keys(TAG_COLORS)) await ensureTag(name);

    for (const r of rows) {
      const segTag = segmentTagName(r.segment);
      const wantedTags = ['birdsview-target',
        ...(segTag ? [segTag] : []),
        ...(r.top10 ? ['bv-top10'] : []),
        ...(r.q4_loi ? ['bv-q4-loi'] : [])];
      if (!segTag) summary.skipped.push(`row ${r.num} "${r.name}": unknown segment "${r.segment}" (segment tag skipped)`);

      if (args.dryRun) {
        const match = findMatch(r);
        if (match) summary.matched++; else summary.created++;
        continue;
      }

      try {
        await client.query('BEGIN');
        let companyId: number;
        const match = findMatch(r);

        if (match) {
          companyId = match.id;
          summary.matched++;
        } else {
          const ins = await client.query<{ id: number }>(
            `INSERT INTO companies (tenant_id, name, website, status, notes, updated_at)
             VALUES ($1,$2,$3,'active',$4, now()) RETURNING id`,
            [args.tenantId, r.name, normalizeWebsite(r.website), buildNotesBlock(r)],
          );
          companyId = ins.rows[0].id;
          summary.created++;
          // Make the new company visible to later rows' matching (dedup on re-run within run too).
          const n = normName(r.name);
          if (n && !byNorm.has(n)) byNorm.set(n, { id: companyId, name: r.name });
          const sNorm = stripLegalSuffix(n);
          if (sNorm && !byStripped.has(sNorm)) byStripped.set(sNorm, { id: companyId, name: r.name });
          summary.notesAdded++; // intel written inline on create
          await client.query(
            `INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, changes)
             VALUES ($1,'create','company',$2,$3::jsonb)`,
            [args.tenantId, companyId, JSON.stringify({
              before: null,
              after: { name: r.name, source: 'birdsview-target-seed', segment: r.segment },
            })],
          );
        }

        // Tags + taggings (idempotent).
        for (const name of wantedTags) {
          const tagId = await ensureTag(name);
          if (tagId < 0) continue;
          const tg = await client.query(
            `INSERT INTO taggings (tag_id, taggable_type, taggable_id)
             VALUES ($1,'company',$2) ON CONFLICT (tag_id, taggable_type, taggable_id) DO NOTHING RETURNING id`,
            [tagId, companyId],
          );
          if (tg.rowCount && tg.rowCount > 0) summary.taggingsAdded++;
        }

        // Append intel block to matched companies (once); created ones already have it.
        if (match) {
          const cur = await client.query<{ notes: string | null }>(
            'SELECT notes FROM companies WHERE id = $1', [companyId],
          );
          const existingNotes = cur.rows[0]?.notes ?? null;
          if (!existingNotes || !existingNotes.includes(NOTES_MARKER)) {
            const next = existingNotes ? `${existingNotes}\n\n${buildNotesBlock(r)}` : buildNotesBlock(r);
            await client.query('UPDATE companies SET notes = $1 WHERE id = $2', [next, companyId]);
            summary.notesAdded++;
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        summary.skipped.push(`row ${r.num} "${r.name}": ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log('─'.repeat(48));
  console.log('  Summary' + (args.dryRun ? ' (DRY RUN — no writes)' : ''));
  console.log('─'.repeat(48));
  console.log(`  matched existing : ${summary.matched}`);
  console.log(`  created new      : ${summary.created}`);
  if (!args.dryRun) {
    console.log(`  taggings added   : ${summary.taggingsAdded}`);
    console.log(`  notes blocks     : ${summary.notesAdded}`);
  }
  console.log(`  skips/warnings   : ${summary.skipped.length}`);
  for (const s of summary.skipped) console.log(`    - ${s}`);
  console.log('─'.repeat(48) + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
