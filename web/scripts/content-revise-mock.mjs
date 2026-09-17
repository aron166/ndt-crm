#!/usr/bin/env node
// Local mock of the three content-revise API endpoints (GET /api/content/queue,
// POST /api/content/:id/claim, POST /api/content/:id/versions), faithful to
// web/src/lib/content/service.ts + the routes under web/src/app/api/content.
// node:http, no deps. Two modes:
//   node content-revise-mock.mjs --port 4789 --state /tmp/x/state.json [--race 105]
//   node content-revise-mock.mjs --check --state /tmp/x/state.json
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const CONTENT_STATUSES = [
  "draft", "in_review", "changes_requested", "rewrite_requested",
  "ai_working", "live", "archived",
];
const REQUESTABLE_STATUSES = ["changes_requested", "rewrite_requested"];
const AUTH = "Bearer test-key";
const APP_SLUG = "mock-app";

function parseArgs(argv) {
  const out = { port: 4789, race: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--state") out.state = argv[++i];
    else if (a === "--check") out.check = true;
    else if (a === "--race") out.race = argv[++i].split(",").map((s) => Number(s.trim()));
  }
  return out;
}

// ── Fixtures ─────────────────────────────────────────────────────────────

const A_HID_V1 = `**Tárgy:** betonvas a meglévő szerkezetben

Tisztelt Tóth Úr!

2020-ban a Millér-patak hídjának acélszerkezetét vizsgáltuk Önöknek, 2021-ben pedig a Lánchíd-munkán dolgoztunk együtt.

Most egy új mérési képesség miatt keresem: ez nem a korábbi acélszerkezet-vizsgálat folytatása, hanem betonvizsgálat, más műszerrel és más kérdésre. Georadarral és lézeres letapogatással megmutatjuk, hol fut a betonvas a meglévő szerkezetben, mekkora a betontakarás és mekkora az átmérő — bontás és sugárzás nélkül, egyoldali hozzáféréssel.

Van most olyan műtárgyuk, ahol a meglévő vaskiosztásról nincs meg a megvalósulási terv?

Üdvözlettel,
Balogh Áron
Uphill Trade`;

const SCRIPT_V1 = `1. Szia, itt X vagyok az Uphill Trade-től, van két perced?
2. Azért hívlak, mert betonvizsgálást csináltok, nem?
3. Nálunk georadaros felmérés van, simán 15000 Ft-tól indul egy helyszín.
4. Szoktatok fúrni vagy vésni meglévő szerkezetbe?
5. Ha igen, jó eséllyel tudunk neked időt spórolni.
6. Mikor érnél rá egy rövid videóhívásra?
7. Nem kell most döntened, csak beszéljünk róla.
8. Küldök egy linket, azon tudsz időpontot foglalni.
9. Ha addig kérdésed van, csak írj.
10. Köszi, hogy meghallgattál, szia!`;

const VIDEO_V1 = `[0-3 mp] Közeli felvétel betonfalról, georadar fejjel végighúzva.
[3-8 mp] Szöveg a képen: "Látjuk, mi van a beton alatt." Váltás a szoftveres 2D térképre.
[8-12 mp] Terepi felvétel: mérnök jegyzetel, mutatja a vasalás helyét krétával.
[12-18 mp] Szöveg: "Bontás nélkül. Sugárzás nélkül." Vágás a céglogóra.
[18-25 mp] CTA felirat: "Kérj felmérést —" + link.`;

const EMAIL_104_V1 = `**Tárgy:** meglévő vasalat felmérése

Tisztelt Cím!

Georadarral és lézeres letapogatással megmutatjuk, hol fut a vasalás a meglévő szerkezetben, bontás és sugárzás nélkül.

Van most olyan helyszínük, ahol fúrás vagy vésés előtt ezt tudni kellene?

Üdvözlettel,
Balogh Áron
Uphill Trade`;

const EMAIL_105_V1 = `**Tárgy:** meglévő vasalat felmérése

Tisztelt Cím!

Egy szám, amiért érdemes lehet visszatérni rá: norvég technológiai partnerünk 600 m² födémet mért fel két óra alatt, a szerkezet megbontása nélkül.

Van most olyan helyszínük, ahol fúrás vagy vésés előtt ezt tudni kellene?

Üdvözlettel,
Balogh Áron
Uphill Trade`;

const EMAIL_106_V1 = `**Tárgy:** Re: meglévő vasalat felmérése

Tisztelt Cím!

Megér tíz percet telefonon? Szerdán 9 és 10 között, vagy csütörtökön 15 és 16 között tudok. Melyik jó?

Üdvözlettel,
Balogh Áron
Uphill Trade`;

function mkVersion(id, number, body, { changeNote = null, authorType = "user", basedOnVersionId = null, reviews = [] } = {}) {
  return {
    id, number, body, changeNote, authorType, basedOnVersionId,
    createdAt: new Date(Date.UTC(2026, 8, 15, 10, 0, number)).toISOString(),
    reviews,
  };
}

function mkItem(base) {
  return {
    needsHumanAsset: false,
    format: null,
    purpose: null,
    externalRef: null,
    campaign: null,
    claimedBy: null,
    claimedAt: null,
    claimedFrom: null,
    ...base,
  };
}

function initialState() {
  return {
    nextVersionId: 200,
    log: [],
    items: [
      mkItem({
        id: 101, title: "A-Híd Zrt. — 1. érintés", category: "email", channel: "cold_email",
        status: "changes_requested", currentVersionId: 1001,
        versions: [
          mkVersion(1001, 1, A_HID_V1, {
            reviews: [{ reviewer: "Nagy Péter", verdict: "changes", comment: "Két dolog: (1) a második bekezdés túl hosszú, vágd ketté; (2) a zárókérdés legyen konkrétabb, a hidakra kérdezzen rá.", at: "2026-09-16T09:00:00.000Z" }],
          }),
        ],
      }),
      mkItem({
        id: 102, title: "Setter telefonszkript", category: "script", channel: "phone",
        status: "rewrite_requested", currentVersionId: 1002,
        versions: [
          mkVersion(1002, 1, SCRIPT_V1, {
            reviews: [{ reviewer: "Áron", verdict: "rewrite", comment: "Írd újra rövidebben, magázva, és ne ígérj árat.", at: "2026-09-16T09:05:00.000Z" }],
          }),
        ],
      }),
      mkItem({
        id: 103, title: "Georadar 9x16 hirdetés", category: "video", format: "9x16_video", channel: "meta_ads",
        status: "rewrite_requested", currentVersionId: 1003,
        versions: [
          mkVersion(1003, 1, VIDEO_V1, {
            reviews: [{ reviewer: "Péter", verdict: "rewrite", comment: "10 mp legyen és a végén logó.", at: "2026-09-16T09:10:00.000Z" }],
          }),
        ],
      }),
      mkItem({
        id: 104, title: "Cold email — vasalat felmérés", category: "email", channel: "cold_email",
        status: "changes_requested", currentVersionId: 1004,
        versions: [
          mkVersion(1004, 1, EMAIL_104_V1, {
            reviews: [{ reviewer: "Áron", verdict: "changes", comment: "Írd bele, hogy 80 cm mélyen is látunk, és hogy 72 órán belül kész a riport.", at: "2026-09-16T09:15:00.000Z" }],
          }),
        ],
      }),
      mkItem({
        id: 105, title: "Cold email — vasalat felmérés (v2 célpont)", category: "email", channel: "cold_email",
        status: "changes_requested", currentVersionId: 1005,
        versions: [
          mkVersion(1005, 1, EMAIL_105_V1, {
            reviews: [{ reviewer: "Nagy Péter", verdict: "changes", comment: "A záró kérdés legyen rövidebb, egy mondat.", at: "2026-09-16T09:20:00.000Z" }],
          }),
        ],
      }),
      mkItem({
        id: 106, title: "Cold email — időpont egyeztetés", category: "email", channel: "cold_email",
        status: "in_review", currentVersionId: 1006,
        versions: [mkVersion(1006, 1, EMAIL_106_V1, {})],
      }),
    ],
  };
}

// ── Persistence ──────────────────────────────────────────────────────────

function loadState(statePath) {
  if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, "utf8"));
  const state = initialState();
  saveState(statePath, state);
  return state;
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function findItem(state, id) {
  return state.items.find((it) => it.id === id) ?? null;
}

function toQueueItem(item) {
  const current = item.versions.find((v) => v.id === item.currentVersionId) ?? null;
  return {
    id: item.id, title: item.title, category: item.category, format: item.format,
    purpose: item.purpose, channel: item.channel, status: item.status,
    externalRef: item.externalRef, needsHumanAsset: item.needsHumanAsset,
    campaign: item.campaign,
    currentVersion: current
      ? { id: current.id, number: current.number, body: current.body, changeNote: current.changeNote, authorType: current.authorType }
      : null,
    assets: [],
    reviews: item.versions.flatMap((v) =>
      v.reviews.map((r) => ({ versionNumber: v.number, reviewer: r.reviewer, verdict: r.verdict, comment: r.comment, at: r.at }))),
    versions: item.versions.map((v) => ({ id: v.id, number: v.number, changeNote: v.changeNote, authorType: v.authorType, createdAt: v.createdAt })),
  };
}

/** Append a human version to an item — clears the claim, item goes in_review. */
function applyHumanEdit(item, state) {
  const last = item.versions[item.versions.length - 1];
  const id = state.nextVersionId++;
  const number = last.number + 1;
  item.versions.push(mkVersion(id, number, `${last.body}\n\n[emberi szerkesztés: pontosítottam a záró kérdést]`, {
    changeNote: "Emberi szerkesztés.", authorType: "user", basedOnVersionId: last.id,
  }));
  item.currentVersionId = id;
  item.status = "in_review";
  item.claimedBy = null;
  item.claimedAt = null;
  item.claimedFrom = null;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": buf.length });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function validateVersionBody(raw) {
  const details = { fieldErrors: {} };
  let body;
  try { body = JSON.parse(raw); } catch { return { error: "Invalid JSON" }; }
  if (typeof body !== "object" || body === null) return { error: "Invalid JSON" };

  const err = (field, msg) => (details.fieldErrors[field] ??= []).push(msg);
  if (typeof body.body !== "string" || body.body.trim().length < 1 || body.body.length > 50000) err("body", "1..50000 chars required");
  if (typeof body.change_note !== "string" || body.change_note.trim().length < 1 || body.change_note.length > 4000) err("change_note", "1..4000 chars required");
  if (!Number.isInteger(body.based_on_version_id) || body.based_on_version_id <= 0) err("based_on_version_id", "positive int required");
  if (body.needs_human_asset !== undefined && typeof body.needs_human_asset !== "boolean") err("needs_human_asset", "must be boolean");

  if (Object.keys(details.fieldErrors).length > 0) return { error: "Validation failed", details };
  return { ok: true, value: body };
}

// ── Server ───────────────────────────────────────────────────────────────

function startServer({ port, state, statePath, race }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;
    let statusSent = 200;
    const send = (status, body) => { statusSent = status; json(res, status, body); };

    try {
      // Test-only endpoints — no auth.
      if (p === "/__test/state" && req.method === "GET") {
        return send(200, state);
      }
      const humanEditMatch = p.match(/^\/__test\/human-edit\/(\d+)$/);
      if (humanEditMatch && req.method === "POST") {
        const item = findItem(state, Number(humanEditMatch[1]));
        if (!item) return send(404, { error: "Not found" });
        applyHumanEdit(item, state);
        saveState(statePath, state);
        return send(200, { ok: true });
      }

      // Real API routes — Bearer test-key required.
      if (req.headers.authorization !== AUTH) return send(401, { error: "Unauthorized" });

      if (p === "/api/content/queue" && req.method === "GET") {
        const raw = url.searchParams.get("status");
        let statuses = ["changes_requested", "rewrite_requested"];
        if (raw) {
          const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
          if (parts.length === 0 || !parts.every((s) => CONTENT_STATUSES.includes(s))) {
            return send(400, { error: "Invalid status", details: { allowed: CONTENT_STATUSES } });
          }
          statuses = parts;
        }
        const items = state.items.filter((it) => statuses.includes(it.status)).map(toQueueItem);
        return send(200, { ok: true, items });
      }

      const claimMatch = p.match(/^\/api\/content\/(\d+)\/claim$/);
      if (claimMatch && req.method === "POST") {
        const id = Number(claimMatch[1]);
        const item = findItem(state, id);
        if (!item) return send(404, { error: "Not found" });

        if (item.status === "ai_working" && item.claimedBy === APP_SLUG) {
          return send(200, { ok: true, alreadyClaimed: true });
        }
        if (!REQUESTABLE_STATUSES.includes(item.status)) {
          return send(409, { error: `not claimable in status ${item.status}` });
        }
        item.claimedFrom = item.status;
        item.status = "ai_working";
        item.claimedAt = new Date().toISOString();
        item.claimedBy = APP_SLUG;
        if (race.includes(id)) applyHumanEdit(item, state); // deterministic race
        saveState(statePath, state);
        return send(200, { ok: true, alreadyClaimed: false });
      }

      const versionsMatch = p.match(/^\/api\/content\/(\d+)\/versions$/);
      if (versionsMatch && req.method === "POST") {
        const id = Number(versionsMatch[1]);
        const item = findItem(state, id);
        if (!item) return send(404, { error: "Not found" });

        const raw = await readBody(req);
        const parsed = validateVersionBody(raw);
        if (!parsed.ok) return send(400, parsed);
        const input = parsed.value;

        if (item.currentVersionId !== input.based_on_version_id) {
          return send(409, { error: "Stale base: a newer version exists" });
        }
        if (item.status !== "ai_working" || item.claimedBy !== APP_SLUG || !item.claimedAt) {
          return send(409, { error: "Not claimed by this app" });
        }

        const last = item.versions[item.versions.length - 1];
        const versionId = state.nextVersionId++;
        const number = last.number + 1;
        item.versions.push(mkVersion(versionId, number, input.body, {
          changeNote: input.change_note, authorType: "ai", basedOnVersionId: input.based_on_version_id,
        }));
        item.currentVersionId = versionId;
        item.status = "in_review";
        item.needsHumanAsset = Boolean(input.needs_human_asset);
        item.claimedBy = null;
        item.claimedAt = null;
        item.claimedFrom = null;
        saveState(statePath, state);
        return send(201, { ok: true, versionId, number });
      }

      return send(404, { error: "Not found" });
    } finally {
      state.log.push({ ts: new Date().toISOString(), method: req.method, path: p, status: statusSent });
      saveState(statePath, state);
    }
  });

  server.listen(port, () => {
    console.log(`content-revise mock listening on http://localhost:${port} (state: ${statePath})`);
  });
  return server;
}

// ── --check ──────────────────────────────────────────────────────────────

function runCheck(statePath) {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const failures = [];
  const item = (id) => findItem(state, id);
  const lastVersion = (it) => it.versions[it.versions.length - 1];

  // 101
  {
    const it = item(101);
    if (it.versions.length < 2) failures.push("101: no new version");
    else {
      const v = lastVersion(it);
      if (v.authorType !== "ai") failures.push("101: last version not authored by ai");
      if (!v.changeNote || !v.changeNote.includes("1.") || !v.changeNote.includes("2.")) failures.push("101: change_note missing point 1./2.");
      if (v.basedOnVersionId !== 1001) failures.push("101: not based on v1 (1001)");
      if (!v.body.includes("Tisztelt Tóth Úr!")) failures.push("101: greeting was changed");
      if (it.status !== "in_review") failures.push(`101: status is ${it.status}, expected in_review`);
    }
  }

  // 102
  {
    const it = item(102);
    if (it.versions.length < 2) failures.push("102: no new version");
    else {
      const v = lastVersion(it);
      const v1 = it.versions[0];
      if (v.body.length >= v1.body.length) failures.push("102: new body is not shorter than v1");
      const hasFormal = /Ön(ök)?/.test(v.body);
      const hasInformal = /\b(te|neked|téged)\b/i.test(v.body);
      if (!hasFormal && hasInformal) failures.push("102: not magázás (no Ön/Önök, has te-forms)");
      if (/\bFt\b/.test(v.body) || /forint/i.test(v.body)) failures.push("102: still contains a price (Ft/forint)");
    }
  }

  // 103
  {
    const it = item(103);
    if (it.versions.length < 2) failures.push("103: no new version");
    else {
      const v = lastVersion(it);
      if (v.authorType !== "ai") failures.push("103: last version not authored by ai");
    }
    if (it.needsHumanAsset !== true) failures.push("103: needs_human_asset not set true");
  }

  // 104
  {
    const it = item(104);
    if (it.versions.length < 2) failures.push("104: no new version");
    else {
      const v = lastVersion(it);
      if (v.body.includes("80 cm")) failures.push("104: body contains forbidden claim '80 cm'");
      if (v.body.includes("72 ór")) failures.push("104: body contains forbidden claim '72 ór'");
      const note = v.changeNote ?? "";
      if (!(/nem/i.test(note) && (note.includes("80") || note.includes("72")))) {
        failures.push("104: change_note doesn't explain the refused claims");
      }
    }
  }

  // 105
  {
    const attempts = state.log.filter((l) => l.path === "/api/content/105/versions" && l.method === "POST" && l.status === 409);
    if (attempts.length !== 1) failures.push(`105: expected exactly one 409 version POST, got ${attempts.length}`);
    const it = item(105);
    const cur = it.versions.find((v) => v.id === it.currentVersionId);
    if (!cur || cur.authorType !== "user") failures.push("105: current version is not the human edit");
  }

  // 106
  {
    const it = item(106);
    if (it.versions.length !== 1) failures.push("106: versions.length !== 1 (was touched)");
    if (it.status !== "in_review") failures.push(`106: status is ${it.status}, expected in_review`);
    if (state.log.some((l) => l.path === "/api/content/106/claim")) failures.push("106: a claim was attempted");
  }

  // No stray endpoints.
  const allowed = /^\/api\/content\/queue(\?.*)?$|^\/api\/content\/\d+\/(claim|versions)$|^\/__test\//;
  for (const l of state.log) {
    if (!allowed.test(l.path)) failures.push(`stray request: ${l.method} ${l.path}`);
  }

  // Every successful AI version preceded by a successful claim for that item.
  for (let i = 0; i < state.log.length; i++) {
    const l = state.log[i];
    const m = l.path.match(/^\/api\/content\/(\d+)\/versions$/);
    if (m && l.method === "POST" && l.status === 201) {
      const id = m[1];
      const claimedBefore = state.log.slice(0, i).some((c) => c.path === `/api/content/${id}/claim` && c.method === "POST" && c.status === 200);
      if (!claimedBefore) failures.push(`item ${id}: version POST succeeded without a prior successful claim`);
    }
  }

  if (failures.length > 0) {
    console.error(failures.map((f) => `FAIL: ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
  process.exit(0);
}

// ── Entry ────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
if (!args.state) {
  console.error("--state <path> is required");
  process.exit(1);
}
if (args.check) {
  runCheck(args.state);
} else {
  const state = loadState(args.state);
  startServer({ port: args.port, state, statePath: args.state, race: args.race });
}
