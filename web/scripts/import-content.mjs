#!/usr/bin/env node
// Import existing growth content into the ndt-crm content-approval pipeline
// (POST /api/content, idempotent on external_ref). Spec:
// workspace/docs/specs/2026-09-17-content-approval-design.md §3.
//
// Dry-run by default: reads files, prints totals + a report table, writes nothing,
// never touches a database or web/.env*. --apply needs --i-have-arons-approval AND
// CRM_URL + CRM_APP_KEY env, and POSTs through the HTTP API only.
//
// Run from web/: node scripts/import-content.mjs [--apply --i-have-arons-approval] [--only=<category>]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";

const GROWTH = "/home/aron166/Projects/growth";
const PROJECTS = "/home/aron166/Projects";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const HAS_APPROVAL = args.includes("--i-have-arons-approval");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null;

if (APPLY && !(HAS_APPROVAL && process.env.CRM_URL && process.env.CRM_APP_KEY)) {
  console.error(
    "Refusing --apply: needs --i-have-arons-approval AND env CRM_URL + CRM_APP_KEY set. Running dry-run instead.",
  );
}
const DO_APPLY = APPLY && HAS_APPROVAL && !!process.env.CRM_URL && !!process.env.CRM_APP_KEY;

const externalRef = (absPath, fragment) => {
  const rel = absPath.startsWith(PROJECTS + "/") ? absPath.slice(PROJECTS.length + 1) : absPath;
  return fragment ? `${rel}#${fragment}` : rel;
};

// ---------- 1. cold-email-v0: 20 files x 4 touches ----------

const notFound = [];

function parseColdEmailFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    notFound.push(path);
    return [];
  }
  const lines = text.split("\n");
  const h1 = lines[0].match(/^#\s*(.+?)\s*—/);
  const company = h1 ? h1[1].trim() : basename(path, ".md");

  const headingRe = /^##\s*(\d+)\.\s*érintés\s*—/;
  const allHeadingLines = [];
  for (let i = 0; i < lines.length; i++) if (/^##\s/.test(lines[i])) allHeadingLines.push(i);

  const items = [];
  for (const i of allHeadingLines) {
    const m = lines[i].match(headingRe);
    if (!m) continue;
    const touch = Number(m[1]);
    const nextHeadingLine = allHeadingLines.find((l) => l > i) ?? lines.length;
    const body = lines.slice(i + 1, nextHeadingLine).join("\n");
    const subjectMatch = body.match(/^\*\*Tárgy:\*\*\s*(.+)$/m);
    if (!subjectMatch) continue;
    const afterTargy = body.slice(body.indexOf(subjectMatch[0]) + subjectMatch[0].length);
    const bodyText = afterTargy.split(/^\s*---\s*$/m)[0].trim();
    if (!bodyText) continue;
    const subject = subjectMatch[1].trim();
    items.push({
      external_ref: externalRef(path, `touch-${touch}`),
      campaign_slug: "cold-email-v0",
      campaign_name: "Hideg levél v0",
      project: "birdsview",
      channel: "email",
      content_type: "email",
      category: "email",
      format: "plain_text_email",
      purpose: `Hideg levél v0, ${touch}. érintés`,
      title: `${company} — ${touch}. érintés`,
      body: `**Tárgy:** ${subject}\n\n${bodyText}`,
      change_note: `Átvéve: ${externalRef(path, `touch-${touch}`)}`,
      import: true,
    });
  }
  return items;
}

const draftsDir = join(GROWTH, "campaigns/cold-email-v0/drafts");
const coldEmailItems = readdirSync(draftsDir)
  .filter((f) => f.endsWith(".md"))
  .flatMap((f) => parseColdEmailFile(join(draftsDir, f)));

// ---------- 2. six single items ----------

function readOrMissing(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    notFound.push(path);
    return null;
  }
}

const singles = [];

// setter script — picked: campaigns/sales-kit/setter-script-DRAFT.md (only "setter" hit; the
// canonical, current call script, referenced by q4-30-devices note as "the" script).
{
  const p = join(GROWTH, "campaigns/sales-kit/setter-script-DRAFT.md");
  const body = readOrMissing(p);
  if (body != null) {
    singles.push({
      external_ref: externalRef(p),
      campaign_slug: "sales-kit",
      campaign_name: "Sales kit",
      project: "birdsview",
      channel: "other",
      content_type: "other",
      category: "script",
      format: "phone_script",
      purpose: "Setter telefonscript v0",
      title: "Setter telefonscript v0",
      body,
      change_note: `Átvéve: ${externalRef(p)}`,
      import: true,
    });
  }
}

// demo offer — campaigns/sales-kit/demo-ajanlat-DRAFT.md (internal sales one-pager for the
// phone/reply-email, not the lead-magnet PDF).
{
  const p = join(GROWTH, "campaigns/sales-kit/demo-ajanlat-DRAFT.md");
  const body = readOrMissing(p);
  if (body != null) {
    singles.push({
      external_ref: externalRef(p),
      campaign_slug: "sales-kit",
      campaign_name: "Sales kit",
      project: "birdsview",
      channel: "email",
      content_type: "other",
      category: "email",
      format: "plain_text_email",
      purpose: "Demó ajánlat — mit adunk, mennyiért, ki foglalja",
      title: "Demó ajánlat v0",
      body,
      change_note: `Átvéve: ${externalRef(p)}`,
      import: true,
    });
  }
}

// signature/legal line — campaigns/sales-kit/alairas-es-jogi-sor-DRAFT.md.
{
  const p = join(GROWTH, "campaigns/sales-kit/alairas-es-jogi-sor-DRAFT.md");
  const body = readOrMissing(p);
  if (body != null) {
    singles.push({
      external_ref: externalRef(p),
      campaign_slug: "cold-email-v0",
      campaign_name: "Hideg levél v0",
      project: "birdsview",
      channel: "other",
      content_type: "other",
      category: "other",
      format: "signature",
      purpose: "Aláírás + adatkezelési / leiratkozási sor",
      title: "Aláírás és jogi sor v0",
      body,
      change_note: `Átvéve: ${externalRef(p)}`,
      import: true,
    });
  }
}

// lead magnet — cold-email-v0/lead-magnet/ellenorzolista-fuas-elott-DRAFT.md (markdown source;
// PDF is produced downstream, not by this script).
{
  const p = join(GROWTH, "campaigns/cold-email-v0/lead-magnet/ellenorzolista-fuas-elott-DRAFT.md");
  const body = readOrMissing(p);
  if (body != null) {
    singles.push({
      external_ref: externalRef(p),
      campaign_slug: "cold-email-v0",
      campaign_name: "Hideg levél v0",
      project: "birdsview",
      channel: "other",
      content_type: "other",
      category: "lead_magnet",
      format: "pdf",
      purpose: "Hideg levél 4. érintés letölthető anyaga / Meta-hirdetés lead magnet",
      title: "7 kérdés, mielőtt meglévő betonba fúrnak vagy vágnak",
      body,
      change_note: `Átvéve: ${externalRef(p)}`,
      import: true,
    });
  }
}

// Market Építő note — campaigns/q4-30-devices/market-epito-note-DRAFT.md (only file matching
// "Market Építő").
{
  const p = join(GROWTH, "campaigns/q4-30-devices/market-epito-note-DRAFT.md");
  const body = readOrMissing(p);
  if (body != null) {
    singles.push({
      external_ref: externalRef(p),
      campaign_slug: "q4-30-devices",
      campaign_name: "Q4 30 devices",
      project: "birdsview",
      channel: "other",
      content_type: "other",
      category: "other",
      purpose: "Market Építő — Herencsár Zsolt, short message about the slip",
      title: "Market Építő — rövid üzenet a csúszásról",
      body,
      change_note: `Átvéve: ${externalRef(p)}`,
      import: true,
    });
  }
}

// BirdsView email — campaigns/q4-30-devices/birdsview-email-DRAFT.md (the only ready-to-send
// email to the BirdsView partner; other hits are dossiers/wiki referencing BirdsView, not an email).
{
  const p = join(GROWTH, "campaigns/q4-30-devices/birdsview-email-DRAFT.md");
  const body = readOrMissing(p);
  if (body != null) {
    singles.push({
      external_ref: externalRef(p),
      campaign_slug: "q4-30-devices",
      campaign_name: "Q4 30 devices",
      project: "birdsview",
      channel: "email",
      content_type: "email",
      category: "email",
      format: "plain_text_email",
      purpose: "BirdsView email — Áron küldi a partnernek",
      title: "BirdsView email — partner program follow-up",
      body,
      change_note: `Átvéve: ${externalRef(p)}`,
      import: true,
    });
  }
}

// ---------- 3. BirdsView ad rough cut (video, no assets — apply doesn't upload) ----------

function ffprobeDuration(path) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
      { encoding: "utf8" },
    ).trim();
    const secs = Number(out);
    return Number.isFinite(secs) ? secs : null;
  } catch {
    return null;
  }
}

const videoDir = join(PROJECTS, "machines/birdsview/content/video/ad-v1-cut/out");
const videoFiles = [
  { file: "ad-v1-16x9.mp4", format: "16x9_video" },
  { file: "ad-v1-9x16.mp4", format: "9x16_video" },
];
const videoItems = [];
for (const { file, format } of videoFiles) {
  const p = join(videoDir, file);
  let size;
  try {
    size = statSync(p).size;
  } catch {
    notFound.push(p);
    continue;
  }
  const mb = (size / (1024 * 1024)).toFixed(1);
  const duration = ffprobeDuration(p);
  const bodyLines = [`**Fájl:** ${file}`, `**Méret:** ${mb} MB`];
  if (duration != null) bodyLines.push(`**Hossz:** ${duration.toFixed(1)} mp`);
  videoItems.push({
    external_ref: externalRef(p),
    campaign_slug: "birdsview-ad-v1",
    campaign_name: "BirdsView ad v1",
    project: "birdsview",
    channel: "facebook",
    content_type: "other",
    category: "video",
    format,
    purpose: "BirdsView hirdetés nyers vágás v1",
    title: `BirdsView hirdetés v1 (${format})`,
    body: bodyLines.join("\n\n"),
    change_note: `Átvéve: ${externalRef(p)}`,
    import: true,
  });
}

// ---------- assemble ----------

let items = [...coldEmailItems, ...singles, ...videoItems];
if (ONLY) items = items.filter((it) => it.category === ONLY);

// ---------- flags ----------

function flagsFor(it) {
  const f = [];
  if (/<[A-Z_]+>/.test(it.body)) f.push("placeholder");
  if (/\bDRAFT\b/.test(it.body)) f.push("DRAFT");
  if (it.body.length > 50000) f.push(">50000 chars");
  return f;
}

// Raw ⚠/⚠️ marker count. The server (POST /api/content, extract_warnings)
// does the real dedup/scaffold-stripping extraction via lib/content/warnings.ts
// (TS, not importable from this plain-JS script) — this is just a cheap
// dry-run signal of how many ContentChecks each item is likely to get.
function markerCount(it) {
  return (it.body.match(/⚠️?/g) ?? []).length;
}

// ---------- report ----------

console.log(`Mode: ${DO_APPLY ? "APPLY" : "DRY-RUN"}${ONLY ? ` (only=${ONLY})` : ""}`);
console.log("");

const byCategory = {};
const markersByCategory = {};
for (const it of items) {
  byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
  markersByCategory[it.category] = (markersByCategory[it.category] ?? 0) + markerCount(it);
}
console.log("Items per category:");
for (const [cat, n] of Object.entries(byCategory).sort()) {
  console.log(`  ${cat}: ${n} (⚠ jelölés: ${markersByCategory[cat]})`);
}
console.log(`  TOTAL: ${items.length} (⚠ jelölés: ${items.reduce((s, it) => s + markerCount(it), 0)})`);
console.log("");

console.log(
  "external_ref".padEnd(70) +
    "category".padEnd(12) +
    "title".padEnd(45) +
    "body_len".padEnd(10) +
    "⚠ jelölés".padEnd(11) +
    "flags",
);
for (const it of items) {
  console.log(
    it.external_ref.padEnd(70) +
      it.category.padEnd(12) +
      it.title.slice(0, 43).padEnd(45) +
      String(it.body.length).padEnd(10) +
      String(markerCount(it)).padEnd(11) +
      (flagsFor(it).join(", ") || "-"),
  );
}

if (notFound.length) {
  console.log("");
  console.log("Sources NOT FOUND:");
  for (const p of notFound) console.log(`  ${p}`);
}

// ---------- apply ----------

if (DO_APPLY) {
  console.log("");
  let created = 0, existed = 0, errors = 0, consecutiveErrors = 0;
  for (const it of items) {
    let res, text;
    try {
      res = await fetch(`${process.env.CRM_URL}/api/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRM_APP_KEY}` },
        body: JSON.stringify(it),
      });
      text = await res.text();
    } catch (e) {
      console.log(`error network ${it.external_ref}: ${e.message}`);
      errors++;
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        console.log("Stopping: 3 consecutive errors.");
        break;
      }
      continue;
    }
    if (!res.ok) {
      console.log(`error ${res.status} ${it.external_ref}: ${text}`);
      errors++;
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        console.log("Stopping: 3 consecutive errors.");
        break;
      }
      continue;
    }
    consecutiveErrors = 0;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    if (parsed.existed) {
      console.log(`existed ${it.external_ref}`);
      existed++;
    } else {
      console.log(`created ${it.external_ref}`);
      created++;
    }
  }
  console.log("");
  console.log(`Summary: created=${created} existed=${existed} errors=${errors} of ${items.length}`);
  if (videoItems.length) {
    console.log("Videó feltöltése kézzel a bírálati oldalon (az upload API böngészős flow, ezt a script nem csinálja).");
  }
}
