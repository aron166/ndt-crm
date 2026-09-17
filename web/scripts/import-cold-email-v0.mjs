#!/usr/bin/env node
// Dry-run importer for campaign cold-email-v0 drafts (growth/campaigns/cold-email-v0/).
// Default mode: dry-run only (reads companies table, prints a report). Never writes.
// --apply requires --i-have-arons-approval AND CRM_URL/CRM_APP_KEY env — the copy is
// not approved yet, so this script is not expected to ever run apply in this task.
//
// Run from web/: node scripts/import-cold-email-v0.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GROWTH_DIR = "/home/aron166/Projects/growth/campaigns/cold-email-v0";
const CAMPAIGN = "cold-email-v0";
const PLAN_DAYS = [1, 4, 8, 15];

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const HAS_APPROVAL = args.includes("--i-have-arons-approval");

if (APPLY && !(HAS_APPROVAL && process.env.CRM_URL && process.env.CRM_APP_KEY)) {
  console.error(
    "Refusing --apply: needs --i-have-arons-approval AND env CRM_URL + CRM_APP_KEY set. Running dry-run instead.",
  );
}
const DO_APPLY = APPLY && HAS_APPROVAL && !!process.env.CRM_URL && !!process.env.CRM_APP_KEY;

// ---------- tiny helpers ----------

// ponytail: hand-rolled RFC4180-ish CSV parser — no new dependency for 2 small files.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCsvObjects(path) {
  const rows = parseCSV(readFileSync(path, "utf8"));
  const header = rows[0];
  return rows.slice(1).filter((r) => r.some((f) => f.trim() !== "")).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])),
  );
}

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function stripAccents(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const LEGAL_FORMS = ["nonprofit", "zrt", "nyrt", "kft", "bt", "rt"];
function normalizeName(name) {
  let n = stripAccents(name.toLowerCase());
  n = n.replace(/[.,]/g, " ");
  n = n.replace(/[^a-z0-9\s-]/g, " ");
  const words = n.split(/\s+/).filter((w) => w && !LEGAL_FORMS.includes(w));
  return words.join(" ").trim();
}

function domainOf(url) {
  if (!url) return null;
  const cleaned = url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return cleaned.split(/[/?#]/)[0].toLowerCase() || null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- load campaign source data ----------

const targets = readCsvObjects(join(GROWTH_DIR, "targets.csv"));
const recipients = readCsvObjects(join(GROWTH_DIR, "recipients.csv"));
const sendPlan = readFileSync(join(GROWTH_DIR, "SEND_PLAN.md"), "utf8");

function parseWave(label) {
  // The wave line wraps across two markdown source lines before the blank line
  // that ends the paragraph — capture up to the first blank line, not just "\n".
  const re = new RegExp(`\\*\\*${label}[^*]*\\*\\*\\s*—\\s*([\\s\\S]+?)\\n\\s*\\n`);
  const m = sendPlan.match(re);
  if (!m) return new Set();
  return new Set(
    m[1]
      .replace(/\n/g, " ")
      .split("·")
      .map((s) => s.trim().match(/^[a-z0-9-]+/)?.[0]) // last item trails into prose after the list, e.g. "uvaterv. Ugyanez a ritmus..."
      .filter(Boolean),
  );
}
const wave1 = parseWave("1\\. hullám \\(10 cég\\)");
const wave2 = parseWave("2\\. hullám \\(10 cég\\)");

// ---------- parse drafts ----------

function parseDraft(slug) {
  const path = join(GROWTH_DIR, "drafts", `${slug}.md`);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: "draft file missing" };
  }

  const headingRe = /^##\s*(\d+)\.\s*érintés\s*—\s*(\d+)\.\s*nap\s*$/;
  const lines = text.split("\n");
  const sections = []; // {touch, day, startLine}
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingRe);
    if (m) sections.push({ touch: Number(m[1]), day: Number(m[2]), line: i });
  }
  // Section end = start of next "## " heading (any), or EOF.
  const allHeadingLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) allHeadingLines.push(i);
  }

  const touches = [];
  const flags = [];
  for (const sec of sections) {
    const nextHeadingLine = allHeadingLines.find((l) => l > sec.line) ?? lines.length;
    const body = lines.slice(sec.line + 1, nextHeadingLine).join("\n");
    const subjectMatch = body.match(/^\*\*Tárgy:\*\*\s*(.+)$/m);
    const subject = subjectMatch ? subjectMatch[1].trim() : null;
    // Body text = everything after the Tárgy line up to a "---" delimiter line, trimmed.
    const afterTargy = subjectMatch
      ? body.slice(body.indexOf(subjectMatch[0]) + subjectMatch[0].length)
      : body;
    const bodyText = afterTargy.split(/^\s*---\s*$/m)[0].trim();
    if (!subject || !bodyText) {
      flags.push(`touch ${sec.touch}: missing subject or body`);
      continue;
    }
    touches.push({ touch: sec.touch, day: sec.day, subject, body: bodyText });
    if (sec.day !== PLAN_DAYS[sec.touch - 1]) {
      flags.push(`touch ${sec.touch}: day ${sec.day} != plan day ${PLAN_DAYS[sec.touch - 1]}`);
    }
    const placeholders = bodyText.match(/<[A-Z_]+>/g);
    if (placeholders) flags.push(`touch ${sec.touch}: unresolved placeholder(s) ${[...new Set(placeholders)].join(", ")}`);
  }

  const touchNums = touches.map((t) => t.touch).sort((a, b) => a - b).join(",");
  const parsedOk = touchNums === "1,2,3,4";
  if (!parsedOk) flags.push(`parsed touches [${touchNums || "none"}] != required [1,2,3,4] — SKIPPED`);

  return { ok: parsedOk, touches, flags };
}

// ---------- wave / sender ----------

function waveOf(slug, name) {
  // SEND_PLAN lists slugs (lowercase, hyphenated) — match by slug text appearing in the wave line.
  const in1 = wave1.has(slug);
  const in2 = wave2.has(slug);
  if (in1 && in2) return { wave: "BOTH", flag: "listed in BOTH waves" };
  if (in1) return { wave: 1, flag: null };
  if (in2) return { wave: 2, flag: null };
  return { wave: "NONE", flag: "listed in NEITHER wave" };
}

// ---------- recipient email pick ----------

const CONFIDENCE_RANK = { exact: 2, "generic-inbox": 1 }; // "unknown" excluded outright

function pickEmail(slug) {
  const rows = recipients.filter((r) => r.slug === slug);
  const candidates = rows.filter((r) => r.email && r.email.toLowerCase() !== "unknown" && EMAIL_RE.test(r.email.trim()));
  if (candidates.length === 0) return { email: null, flag: "no usable email in recipients.csv" };
  candidates.sort((a, b) => (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0));
  const chosen = candidates[0];
  const flag = chosen.verify_before_send?.trim().toLowerCase() === "yes" ? "verify_before_send=yes" : null;
  return { email: chosen.email.trim(), flag, confidence: chosen.confidence, person: chosen.person_or_role };
}

// ---------- DB: company matching ----------

async function main() {
  const env = parseEnv(join(WEB_ROOT, ".env"));
  const connectionString = env.DIRECT_URL;
  if (!connectionString) throw new Error("DIRECT_URL not found in web/.env");

  const client = new Client({ connectionString });
  await client.connect();

  let hasWebsiteCol = false;
  try {
    const colRes = await client.query(
      `select column_name from information_schema.columns where table_name = 'companies' and column_name in ('website','domain')`,
    );
    hasWebsiteCol = colRes.rows.length > 0;
  } catch {
    hasWebsiteCol = false;
  }

  const companiesRes = await client.query(
    `select id, name${hasWebsiteCol ? ", website" : ""} from companies where tenant_id = 1 and deleted_at is null`,
  );
  const companies = companiesRes.rows;
  await client.end();

  function matchCompany(target) {
    const exact = companies.find((c) => c.name.trim().toLowerCase() === target.name.trim().toLowerCase());
    if (exact) return { id: exact.id, name: exact.name, how: "exact name" };

    const normTarget = normalizeName(target.name);
    const norm = companies.find((c) => normalizeName(c.name) === normTarget);
    if (norm) return { id: norm.id, name: norm.name, how: "normalized name" };

    if (hasWebsiteCol) {
      const targetDomain = domainOf(target.website);
      if (targetDomain) {
        const byDomain = companies.find((c) => c.website && domainOf(c.website) === targetDomain);
        if (byDomain) return { id: byDomain.id, name: byDomain.name, how: "website domain" };
      }
    }
    return null;
  }

  // ---------- build per-slug rows ----------

  const results = [];
  let matchedCount = 0;
  let draftsToCreate = 0;
  let draftsSkipped = 0;

  for (const target of targets) {
    const slug = target.slug;
    const match = matchCompany(target);
    if (match) matchedCount++;

    const draft = parseDraft(slug);
    const { email, flag: emailFlag } = pickEmail(slug);
    const { wave, flag: waveFlag } = waveOf(slug, target.name);
    const sender = target.cl_history?.trim().toLowerCase() === "yes" ? "peter" : "aron";

    const flags = [...draft.flags];
    if (emailFlag) flags.push(emailFlag);
    if (waveFlag) flags.push(waveFlag);
    if (!match) flags.push("company MISSING in CRM");
    if (!email) flags.push("no toEmail");

    const wouldCreate = draft.ok && !!match && !!email;
    if (wouldCreate) draftsToCreate += draft.touches.length;
    else draftsSkipped += draft.ok ? draft.touches.length : 4;

    results.push({
      slug,
      companyId: match ? match.id : "MISSING",
      how: match ? match.how : "-",
      toEmail: email ?? "NONE",
      wave,
      sender,
      touchesParsed: draft.touches.length,
      flags,
    });
  }

  // ---------- report ----------

  console.log(`Campaign: ${CAMPAIGN}`);
  console.log(`Mode: ${DO_APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log("");
  console.log(`Totals: ${targets.length} target slugs`);
  console.log(`  companies matched: ${matchedCount} / ${targets.length}`);
  console.log(`  companies MISSING: ${targets.length - matchedCount}`);
  console.log(`  drafts that would be created: ${draftsToCreate}`);
  console.log(`  drafts skipped: ${draftsSkipped}`);
  console.log("");
  console.log(
    "slug".padEnd(22) +
      "companyId".padEnd(11) +
      "how".padEnd(16) +
      "toEmail".padEnd(38) +
      "wave".padEnd(6) +
      "sender".padEnd(8) +
      "touches".padEnd(8) +
      "flags",
  );
  for (const r of results) {
    console.log(
      r.slug.padEnd(22) +
        String(r.companyId).padEnd(11) +
        r.how.padEnd(16) +
        r.toEmail.padEnd(38) +
        String(r.wave).padEnd(6) +
        r.sender.padEnd(8) +
        String(r.touchesParsed).padEnd(8) +
        (r.flags.length ? r.flags.join("; ") : "-"),
    );
  }

  // Kai 2026-09-17: wave 1 goes out Tue 09-22, wave 2 Tue 09-29, 08:00 Budapest (CEST = UTC+2).
  const WAVE_START = { 1: "2026-09-22T06:00:00Z", 2: "2026-09-29T06:00:00Z" };
  // users.id on prod (tenant 1): 2 = Áron, 3 = Nagy Péter.
  const SENDER_USER_ID = { aron: 2, peter: 3 };
  console.log("");
  console.log(`Apply would set: senderUserId ${JSON.stringify(SENDER_USER_ID)}, touch-1 dueAt ${JSON.stringify(WAVE_START)} (BOTH/NONE waves left unset)`);

  if (DO_APPLY) {
    // Not exercised by this task (dry-run only), kept for completeness per spec.
    const drafts = [];
    for (const r of results) {
      if (r.companyId === "MISSING" || r.toEmail === "NONE") continue;
      const draft = parseDraft(r.slug);
      if (!draft.ok) continue;
      for (const t of draft.touches) {
        drafts.push({
          companyId: r.companyId, campaign: CAMPAIGN, step: t.touch, subject: t.subject, body: t.body, toEmail: r.toEmail,
          // Tracking (API since 2026-09-17). BOTH/NONE waves stay unset for Áron to decide.
          senderUserId: SENDER_USER_ID[r.sender] ?? null,
          ...(typeof r.wave === "number" ? { wave: r.wave } : {}),
          ...(typeof r.wave === "number" && t.touch === 1 ? { dueAt: WAVE_START[r.wave] } : {}),
        });
      }
    }
    for (let i = 0; i < drafts.length; i += 200) {
      const batch = drafts.slice(i, i + 200);
      const res = await fetch(`${process.env.CRM_URL}/api/outreach/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRM_APP_KEY}` },
        body: JSON.stringify({ drafts: batch }),
      });
      const text = await res.text();
      console.log(`POST batch ${i / 200 + 1}: ${res.status} ${text}`);
      if (!res.ok) {
        console.error("Stopping: batch failed.");
        process.exit(1);
      }
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e.stack || e);
  process.exit(1);
});
