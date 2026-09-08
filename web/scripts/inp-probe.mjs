#!/usr/bin/env node
// Zero-dependency CDP-based INP probe. See scripts/README (none needed) — flags: --json <path>
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:3100";
const CDP_PORT = 9333;
const CHROME_BIN = "/usr/bin/google-chrome";
const WEB_ROOT = new URL("..", import.meta.url).pathname; // .../web/
const COOKIE_FILE = join(WEB_ROOT, ".smoke-cookie.txt");

// INP only counts these event types (click/tap + keyboard). Everything else
// (pointerover/pointerout/mouseover/...) is captured for visibility but must
// never win the "INP" number for a row.
const INP_ELIGIBLE = new Set(["pointerdown", "pointerup", "click", "keydown", "keypress", "keyup"]);

const args = process.argv.slice(2);
const jsonFlagIdx = args.indexOf("--json");
const jsonOutPath = jsonFlagIdx !== -1 ? args[jsonFlagIdx + 1] : null;

let chromeProc = null;
let userDataDir = null;
let ws = null;

function log(...a) { console.error(...a); }

// ---------- process lifecycle ----------
function cleanup() {
  try { if (ws) ws.close(); } catch {}
  try { if (chromeProc && !chromeProc.killed) chromeProc.kill("SIGKILL"); } catch {}
  try { if (userDataDir) rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });
process.on("uncaughtException", (e) => { log("FATAL:", e.stack || e); cleanup(); process.exit(1); });

async function main() {
  userDataDir = mkdtempSync(join(tmpdir(), "inp-probe-"));
  chromeProc = spawn(CHROME_BIN, [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--window-size=1440,900",
  ], { stdio: "ignore" });

  const versionInfo = await pollForVersion();
  ws = new WebSocket(versionInfo.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", (e) => rej(new Error("ws error: " + e.message)), { once: true });
  });

  const cdp = makeCdp(ws);

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  // Headless Chrome only does real compositor hit-testing (elementFromPoint,
  // actual click delivery) on the foregrounded tab — without this every click
  // silently lands on <body>/<html> instead of the real target.
  await cdp.send("Page.bringToFront", {}, sessionId);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }, sessionId);

  const cookieStr = readFileSync(COOKIE_FILE, "utf8").trim();
  const pairs = cookieStr.split(";").map((s) => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    await cdp.send("Network.setCookie", { name, value, domain: "localhost", path: "/", url: `${BASE}/` }, sessionId);
  }

  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVER_SOURCE }, sessionId);

  const results = [];

  await navigate(cdp, sessionId, `${BASE}/`);
  await settle(cdp, sessionId);
  const landedUrl = (await evalExpr(cdp, sessionId, "location.pathname")).value;
  if (landedUrl.startsWith("/login")) {
    throw new Error("AUTH FAILED: landed on /login — cookie invalid or expired");
  }
  log(`Authenticated OK, landed on ${landedUrl}`);

  const ONLY = process.env.INP_ONLY; // debug helper, unset in normal use
  const SKIP = new Set((process.env.INP_SKIP || "").split(",").filter(Boolean));

  if ((!ONLY || ONLY === "a") && !SKIP.has("a")) {
  // ---------- (a) dashboard: panel-head nav link click ----------
  results.push(await runOnPage(cdp, sessionId, "dashboard: panel-head nav link click", `${BASE}/`, async () => {
    const found = await evalExpr(cdp, sessionId, `
      (() => {
        const links = Array.from(document.querySelectorAll('.panel-head a'));
        const el = links.find(a => a.textContent && a.textContent.includes('Kanban'))
                || links.find(a => a.textContent && a.textContent.includes('Hívás mód'))
                || links[0];
        if (!el) return false;
        el.setAttribute('data-inp-target', '1');
        return true;
      })()
    `);
    if (!found.value) return { skip: ".panel-head a" };
    return clickAndMeasure(cdp, sessionId, '[data-inp-target="1"]');
  }));
  }

  if ((!ONLY || ONLY === "b") && !SKIP.has("b")) {
  // ---------- (b) leads: kanban card open ----------
  results.push(await runOnPage(cdp, sessionId, "leads: kanban card open", `${BASE}/leads`, () =>
    clickAndMeasure(cdp, sessionId, '.kcol-body > div[role="button"]', getCardOwnPoint)));
  }

  if ((!ONLY || ONLY === "c") && !SKIP.has("c")) {
  // ---------- (c) leads: card drag between columns ----------
  results.push(await measureDrag(cdp, sessionId, "leads: card drag between columns", `${BASE}/leads`));
  }

  if ((!ONLY || ONLY === "d") && !SKIP.has("d")) {
  // ---------- (d) leads: outcome modal open + submit ----------
  const { openResult, submitResult } = await measureOutcomeModal(cdp, sessionId, `${BASE}/leads`);
  results.push(openResult);
  results.push(submitResult);
  }

  if ((!ONLY || ONLY === "e") && !SKIP.has("e")) {
  // ---------- (e) companies: filter typing ----------
  results.push(await runOnPage(cdp, sessionId, "companies: filter typing", `${BASE}/companies`, () =>
    typeAndMeasure(cdp, sessionId, 'input[placeholder^="Keresés cég"]', "kft")));
  }

  if ((!ONLY || ONLY === "f") && !SKIP.has("f")) {
  // ---------- (f) persons: search typing ----------
  results.push(await runOnPage(cdp, sessionId, "persons: search typing", `${BASE}/persons`, () =>
    typeAndMeasure(cdp, sessionId, 'input[placeholder^="Keresés név"]', "nagy")));
  }

  if ((!ONLY || ONLY === "g") && !SKIP.has("g")) {
  // ---------- (g) tasks: completion click ----------
  await ensureOpenTaskExists(cdp, sessionId);
  results.push(await runOnPage(cdp, sessionId, "tasks: completion click", `${BASE}/tasks`, () =>
    clickAndMeasure(cdp, sessionId, 'button[title="Kész"]')));
  }

  printTable(results);

  if (jsonOutPath) {
    writeFileSync(jsonOutPath, JSON.stringify(results, null, 2));
    log(`\nRaw results written to ${jsonOutPath}`);
  }
}

// ---------- injected page-side observer ----------
const OBSERVER_SOURCE = `
(() => {
  window.__inp = [];
  window.__loaf = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__inp.push({
          name: e.name, startTime: e.startTime, duration: e.duration,
          processingStart: e.processingStart, processingEnd: e.processingEnd,
          target: e.target ? (e.target.tagName + (e.target.className && typeof e.target.className === 'string' ? '.' + e.target.className.split(' ').filter(Boolean).slice(0,2).join('.') : '')) : null,
        });
      }
    }).observe({ type: 'event', durationThreshold: 0, buffered: true });
  } catch (err) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__loaf.push({
          startTime: e.startTime, duration: e.duration, blockingDuration: e.blockingDuration,
          renderStart: e.renderStart, styleAndLayoutStart: e.styleAndLayoutStart,
          scripts: (e.scripts || []).map(s => ({
            invoker: s.invoker, sourceURL: s.sourceURL, duration: s.duration,
            forcedStyleAndLayoutDuration: s.forcedStyleAndLayoutDuration,
          })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (err) {}
  window.__resetPerf = () => { window.__inp = []; window.__loaf = []; };
})();
`;

// ---------- CDP transport ----------
function makeCdp(socket) {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`CDP ${msg.error.message}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      const set = listeners.get(msg.method);
      if (set) for (const fn of set) fn(msg.params, msg.sessionId);
    }
  });

  function send(method, params = {}, sessionId) {
    const id = nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify(payload));
    });
  }
  function on(method, fn) {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
    return () => listeners.get(method).delete(fn);
  }
  return { send, on };
}

async function pollForVersion() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return res.json();
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome did not open its debugging port in time");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- navigation / evaluation helpers ----------
async function navigate(cdp, sessionId, url) {
  const loadPromise = new Promise((resolve) => {
    const off = cdp.on("Page.loadEventFired", () => { off(); resolve(); });
  });
  await cdp.send("Page.navigate", { url }, sessionId);
  await loadPromise;
}

async function settle(cdp, sessionId) {
  await cdp.send("Page.bringToFront", {}, sessionId).catch(() => {});
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await evalExpr(cdp, sessionId, "document.readyState");
    if (r.value === "complete") break;
    await sleep(100);
  }
  await sleep(800); // let hydration finish
}

async function evalExpr(cdp, sessionId, expression, awaitPromise = false) {
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, sessionId);
  if (res.exceptionDetails) {
    throw new Error("Eval error: " + JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails));
  }
  return res.result;
}

async function resetPerf(cdp, sessionId) {
  await evalExpr(cdp, sessionId, "window.__resetPerf && window.__resetPerf()");
}

async function readPerf(cdp, sessionId) {
  const inp = await evalExpr(cdp, sessionId, "window.__inp || []");
  const loaf = await evalExpr(cdp, sessionId, "window.__loaf || []");
  return { inp: inp.value || [], loaf: loaf.value || [] };
}

// ---------- generic page runner: navigate, settle, run action, finalize with label ----------
async function runOnPage(cdp, sessionId, label, url, actionFn) {
  await navigate(cdp, sessionId, url);
  await settle(cdp, sessionId);
  const r = await actionFn();
  return finalize(label, r);
}

// ---------- input helpers ----------
// Returns the click point for `selector`, verified via elementFromPoint so a
// sticky/fixed header overlapping the element (which scrollIntoView({block:'center'})
// does not know about) can't silently steal the click. Falls back to a
// block:'nearest' scroll + re-check before giving up.
async function getCenter(cdp, sessionId, selector) {
  const r = await evalExpr(cdp, sessionId, `
    (() => {
      const sel = ${JSON.stringify(selector)};
      const el = document.querySelector(sel);
      if (!el) return null;
      const hit = (rect) => {
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        const top = document.elementFromPoint(x, y);
        // top must BE el or a descendant of it (e.g. an icon inside a button).
        // NOT the reverse (top.contains(el)) — that would pass even when el is
        // clipped out of view by a scrolled/overflow-hidden ancestor and the
        // hit actually lands on that ancestor's background.
        const ok = top && (el === top || el.contains(top));
        return { x, y, w: rect.width, h: rect.height, ok };
      };
      let res = hit(el.getBoundingClientRect());
      if (!res.ok) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        res = hit(el.getBoundingClientRect());
      }
      return res;
    })()
  `);
  if (!r.value) return null;
  if (!r.value.ok) return { ...r.value, w: 0, h: 0 }; // signal "not really clickable" to callers
  return r.value;
}

// Like getCenter, but for a container (the kanban card) that has interactive
// children (Links, buttons) covering most of its area — scans several points
// inside the card until it finds one that hits the CARD ITSELF (its own
// onClick), not a nested link/button that would navigate somewhere else
// entirely (observed: center-point click was landing on the company Link).
async function getCardOwnPoint(cdp, sessionId, selector) {
  const r = await evalExpr(cdp, sessionId, `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const candidates = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(f => rect.y + rect.height * f);
      for (const y of candidates) {
        const x = rect.x + rect.width * 0.5;
        if (document.elementFromPoint(x, y) === el) return { x, y, w: rect.width, h: rect.height, ok: true };
      }
      return { w: 0, h: 0, ok: false };
    })()
  `);
  return r.value;
}

async function trustedMouseMove(cdp, sessionId, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, sessionId);
}
async function trustedPressRelease(cdp, sessionId, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, buttons: 1 }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, buttons: 1 }, sessionId);
}

// Click flow per correction: move mouse first (settles hover state OUTSIDE the
// measurement window), THEN reset perf buffers, THEN press/release, THEN read.
// `pointFn` defaults to getCenter; pass getCardOwnPoint for containers with
// interactive children that would otherwise steal the click.
async function clickAndMeasure(cdp, sessionId, selector, pointFn = getCenter) {
  const rect = await pointFn(cdp, sessionId, selector);
  if (!rect || rect.w === 0 || rect.h === 0) return { skip: selector };
  await sleep(50);
  const rect2 = await pointFn(cdp, sessionId, selector); // re-read after scrollIntoView settled
  await trustedMouseMove(cdp, sessionId, rect2.x, rect2.y);
  await sleep(150);
  await resetPerf(cdp, sessionId);
  await trustedPressRelease(cdp, sessionId, rect2.x, rect2.y);
  // ponytail: extra buffer — a click that triggers client-side SPA navigation
  // races the next Page.navigate otherwise (empirically: <2s left the next
  // click on the next page dead — no events at all, even though hit-test and
  // dispatch both reported success). If this ever needs to go lower, verify
  // against the exact repro in git history first.
  await sleep(2200);
  const { inp, loaf } = await readPerf(cdp, sessionId);
  return summarize(inp, loaf);
}

// Typing flow: click to focus (unmeasured), settle, THEN reset, THEN type,
// verifying the controlled input's value actually grows after each keystroke.
async function typeAndMeasure(cdp, sessionId, selector, text) {
  const rect = await getCenter(cdp, sessionId, selector);
  if (!rect || rect.w === 0 || rect.h === 0) return { skip: selector };
  await trustedMouseMove(cdp, sessionId, rect.x, rect.y);
  await trustedPressRelease(cdp, sessionId, rect.x, rect.y);
  await sleep(200);
  const active = await evalExpr(cdp, sessionId, `document.activeElement === document.querySelector(${JSON.stringify(selector)})`);
  if (!active.value) return { skip: `${selector} (click did not focus it)` };
  await sleep(150);
  await resetPerf(cdp, sessionId);

  let prevLen = 0;
  for (const ch of text) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, unmodifiedText: ch, key: ch }, sessionId);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", text: ch, unmodifiedText: ch, key: ch }, sessionId);
    await sleep(60);
    const valRes = await evalExpr(cdp, sessionId, `document.querySelector(${JSON.stringify(selector)}).value`);
    const val = valRes.value || "";
    if (val.length <= prevLen) {
      return { skip: null, invalid: `keystroke '${ch}' did not reach React — input value stayed "${val}" (controlled input not updated by CDP key event)` };
    }
    prevLen = val.length;
  }
  await sleep(2200); // ponytail: same safety buffer as clickAndMeasure
  const { inp, loaf } = await readPerf(cdp, sessionId);
  const keyEntries = inp.filter((e) => e.name === "keydown" || e.name === "keypress" || e.name === "keyup");
  return summarize(keyEntries.length ? keyEntries : inp, loaf, keyEntries.length ? null : "no keydown/keypress/keyup entries; falling back to full entry set");
}

// ---------- measurement summary ----------
function summarize(inp, loaf, extraNote) {
  if (!inp.length) {
    return { skipped: true, note: "no Event Timing entries captured at all (durationThreshold:0, so this means the interaction produced no observable event)" };
  }
  const eligible = inp.filter((e) => INP_ELIGIBLE.has(e.name));
  const ineligible = inp.filter((e) => !INP_ELIGIBLE.has(e.name));
  const ineligibleMax = ineligible.length ? Math.round(Math.max(...ineligible.map((e) => e.duration))) : null;

  if (!eligible.length) {
    return {
      skipped: true,
      note: `no INP-eligible entries (click/keyboard) captured${ineligibleMax !== null ? `; ineligibleMax=${ineligibleMax}ms (hover/other)` : ""}`,
      ineligibleMax,
    };
  }

  const worst = [...eligible].sort((a, b) => b.duration - a.duration).slice(0, 3);
  const top = worst[0];
  const worstLoaf = loaf.length ? loaf.reduce((a, b) => (b.blockingDuration > a.blockingDuration ? b : a)) : null;
  const topScript = worstLoaf && worstLoaf.scripts && worstLoaf.scripts.length
    ? [...worstLoaf.scripts].sort((a, b) => b.duration - a.duration)[0] : null;

  return {
    inpMs: Math.round(top.duration),
    inputDelayMs: Math.round(top.processingStart - top.startTime),
    processingMs: Math.round(top.processingEnd - top.processingStart),
    presentationMs: Math.round(top.startTime + top.duration - top.processingEnd),
    ineligibleMax,
    worstLoafBlockingMs: worstLoaf ? Math.round(worstLoaf.blockingDuration) : null,
    attribution: `${top.target || "(unknown target)"}${topScript ? ` + ${topScript.invoker || topScript.sourceURL || "script"}` : ""}`,
    worst3: worst,
    note: extraNote || null,
  };
}

function finalize(label, r) {
  if (r.invalid) return { label, skipped: true, note: `SKIPPED (${r.invalid})` };
  if (r.skip) return { label, skipped: true, note: `SKIPPED (selector not found: ${r.skip})` };
  if (r.skipped) return { label, skipped: true, note: r.note, ineligibleMax: r.ineligibleMax ?? null };
  return { label, ...r };
}

// ---------- drag (interaction c) ----------
async function measureDrag(cdp, sessionId, label, url) {
  await navigate(cdp, sessionId, url);
  await settle(cdp, sessionId);

  const cols = await evalExpr(cdp, sessionId, `
    Array.from(document.querySelectorAll('.kcol')).map((c, i) => {
      const card = c.querySelector('.kcol-body > div[role="button"]');
      return { idx: i, hasCard: !!card };
    })
  `);
  const columns = cols.value || [];
  const sourceCol = columns.find((c) => c.hasCard);
  const targetCol = columns.find((c) => c.idx !== (sourceCol ? sourceCol.idx : -1));
  if (!sourceCol || !targetCol) {
    return { label, skipped: true, note: "SKIPPED (could not find a source column with a card and a distinct target column)" };
  }

  const preTextRes = await evalExpr(cdp, sessionId, `
    document.querySelectorAll('.kcol')[${sourceCol.idx}].querySelector('.kcol-body > div[role="button"]').textContent.slice(0, 24)
  `);
  const preText = preTextRes.value;

  await resetPerf(cdp, sessionId);

  // Each fire() must let React commit the state update from the previous
  // event before the next one runs — firing all events synchronously in one
  // tick meant 'drop' read a stale (still-null) draggingId closure and
  // silently no-opped, even though dragstart's listener genuinely ran.
  const dragRes = await evalExpr(cdp, sessionId, `
    (async () => {
      const cols = Array.from(document.querySelectorAll('.kcol'));
      const src = cols[${sourceCol.idx}];
      const tgt = cols[${targetCol.idx}];
      const card = src.querySelector('.kcol-body > div[role="button"]');
      if (!card || !tgt) return { ok: false };
      const dt = new DataTransfer();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const fire = async (el, type) => { el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })); await wait(60); };
      await fire(card, 'dragstart');
      await fire(tgt, 'dragenter');
      await fire(tgt, 'dragover');
      await fire(tgt, 'dragover');
      await fire(tgt, 'dragover');
      await fire(tgt, 'drop');
      await fire(card, 'dragend');
      return { ok: true };
    })()
  `, true);
  if (!dragRes.value || !dragRes.value.ok) {
    return { label, skipped: true, note: "SKIPPED (drag source/target elements not found in live DOM)" };
  }

  await sleep(2200); // ponytail: same safety buffer as clickAndMeasure

  const postCheck = await evalExpr(cdp, sessionId, `
    (() => {
      const tgt = document.querySelectorAll('.kcol')[${targetCol.idx}];
      const body = tgt && tgt.querySelector('.kcol-body');
      return body ? body.textContent.includes(${JSON.stringify(preText)}) : false;
    })()
  `);
  const moved = !!postCheck.value;

  const { loaf } = await readPerf(cdp, sessionId);
  const worstLoaf = loaf.length ? loaf.reduce((a, b) => (b.blockingDuration > a.blockingDuration ? b : a)) : null;
  const topScript = worstLoaf && worstLoaf.scripts && worstLoaf.scripts.length
    ? [...worstLoaf.scripts].sort((a, b) => b.duration - a.duration)[0] : null;

  if (!moved) {
    return {
      label, skipped: true,
      note: "SKIPPED (synthetic DragEvent dispatch did not move the card between columns — app's onDrop handler likely did not fire / react to it)",
    };
  }

  return {
    label,
    synthetic: true,
    note: "SYNTHETIC (untrusted events, not Event Timing — main-thread cost read from long-animation-frame instead); card confirmed moved to target column",
    worstLoafBlockingMs: worstLoaf ? Math.round(worstLoaf.blockingDuration) : null,
    attribution: topScript ? (topScript.invoker || topScript.sourceURL || "script") : "(no LoAF entries)",
    worst3: loaf.slice(0, 3),
  };
}

// ---------- tasks helper (interaction g) ----------
// Repeated runs against this dev DB eventually complete the only open task,
// leaving nothing for the "tasks: completion click" row to click. Create a
// disposable one through the real UI (title is the only required field) so
// the row measures the actual completion control instead of skipping.
async function ensureOpenTaskExists(cdp, sessionId) {
  await navigate(cdp, sessionId, `${BASE}/tasks`);
  await settle(cdp, sessionId);
  const has = await evalExpr(cdp, sessionId, `!!document.querySelector('button[title="Kész"]')`);
  if (has.value) return;

  const found = await evalExpr(cdp, sessionId, `
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Új feladat'));
      if (!btn) return false;
      btn.setAttribute('data-inp-newtask', '1');
      return true;
    })()
  `);
  if (!found.value) return; // give up quietly; the click step will report SKIPPED with a clear reason

  const rect = await getCenter(cdp, sessionId, '[data-inp-newtask="1"]');
  if (!rect || rect.w === 0) return;
  await trustedMouseMove(cdp, sessionId, rect.x, rect.y);
  await trustedPressRelease(cdp, sessionId, rect.x, rect.y);
  await sleep(400);

  const titleRect = await getCenter(cdp, sessionId, '[role="dialog"] input[placeholder="Feladat megnevezése"]');
  if (!titleRect || titleRect.w === 0) return;
  await trustedMouseMove(cdp, sessionId, titleRect.x, titleRect.y);
  await trustedPressRelease(cdp, sessionId, titleRect.x, titleRect.y);
  await sleep(100);
  for (const ch of "INP probe test task") {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, unmodifiedText: ch, key: ch }, sessionId);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", text: ch, unmodifiedText: ch, key: ch }, sessionId);
  }
  await sleep(200);
  const submitRect = await getCenter(cdp, sessionId, '[role="dialog"] button[type="submit"]');
  if (!submitRect || submitRect.w === 0) return;
  await trustedMouseMove(cdp, sessionId, submitRect.x, submitRect.y);
  await trustedPressRelease(cdp, sessionId, submitRect.x, submitRect.y);
  await sleep(1500);
}

// ---------- outcome modal (interaction d) ----------
async function measureOutcomeModal(cdp, sessionId, url) {
  await navigate(cdp, sessionId, url);
  await settle(cdp, sessionId);

  const leadIdRes = await evalExpr(cdp, sessionId, `
    (() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Hívás eredménye');
      if (!btn) return null;
      const card = btn.closest('[role="button"]');
      let leadId = null;
      if (card) {
        const link = card.querySelector('a[href^="/leads/"]');
        if (link) { const m = link.getAttribute('href').match(/\\/leads\\/(\\d+)/); if (m) leadId = m[1]; }
      }
      return leadId;
    })()
  `);
  const leadId = leadIdRes.value;

  const openR = await clickAndMeasure(cdp, sessionId, 'button[title="Hívás eredménye"]');
  const openFinal = finalize("leads: outcome modal open", openR);
  if (leadId) log(`outcome modal targeted lead id=${leadId}`);

  // Confirm the modal actually rendered before trying to submit.
  await sleep(200);
  const dialogPresent = await evalExpr(cdp, sessionId, `!!document.querySelector('[role="dialog"]')`);
  if (!dialogPresent.value) {
    return {
      openResult: openFinal,
      submitResult: { label: "leads: outcome modal submit", skipped: true, note: "SKIPPED (modal did not appear after clicking Hívás eredménye — nothing to submit)" },
    };
  }

  // Submit button is portalled to document.body by the dialog primitive, and the
  // page has OTHER type=submit buttons (e.g. topbar search) — scope the query to
  // the open dialog so we grab the real "Rögzítés" primary button, not the first
  // type=submit on the page.
  const submitR = await clickAndMeasure(cdp, sessionId, '[role="dialog"] button[type="submit"]');
  const submitFinal = finalize("leads: outcome modal submit", submitR);
  if (leadId && !submitFinal.skipped) {
    submitFinal.note = (submitFinal.note ? submitFinal.note + " " : "") + `(lead id=${leadId} mutated — default outcome no_answer, needs no extra field)`;
  }

  return { openResult: openFinal, submitResult: submitFinal };
}

// ---------- output ----------
function printTable(results) {
  console.log("\nAll numbers captured under 4x CPU throttling (Emulation.setCPUThrottlingRate rate:4). durationThreshold:0.\n");
  console.log("| interaction | INP (ms) | input delay | processing | presentation | worst LoAF blockingDuration | ineligibleMax (hover etc) | attribution |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.skipped) {
      console.log(`| ${r.label} | ${r.note} | - | - | - | - | ${r.ineligibleMax ?? "-"} | - |`);
    } else if (r.synthetic) {
      console.log(`| ${r.label} | ${r.note} | - | - | - | ${r.worstLoafBlockingMs ?? "-"} | - | ${r.attribution} |`);
    } else {
      console.log(`| ${r.label} | ${r.inpMs} | ${r.inputDelayMs} | ${r.processingMs} | ${r.presentationMs} | ${r.worstLoafBlockingMs ?? "-"} | ${r.ineligibleMax ?? "-"} | ${r.attribution} |`);
    }
  }
  console.log("\nWorst-3 raw entries per interaction:\n");
  console.log("```json");
  console.log(JSON.stringify(results.map((r) => ({ label: r.label, worst3: r.worst3 ?? null, skipped: !!r.skipped, note: r.note ?? null })), null, 2));
  console.log("```");
}

main()
  .then(() => { cleanup(); process.exit(0); })
  .catch((err) => { log("ERROR:", err.stack || err); cleanup(); process.exit(1); });
