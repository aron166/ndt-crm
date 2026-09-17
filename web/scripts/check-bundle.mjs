#!/usr/bin/env node
// Bundle-size regression gate. Reads the client JS chunks each app route
// actually loads (from Next's per-route RSC client-reference-manifest, which
// Turbopack emits instead of the older app-build-manifest.json) and compares
// their on-disk size under .next/static against web/perf-budget.json.
//
// Requires an existing `.next` build (see docs/ci.md for how to produce one).
// Usage: node scripts/check-bundle.mjs

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const NEXT_DIR = join(ROOT, ".next");
const BUDGET_PATH = join(ROOT, "perf-budget.json");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!existsSync(NEXT_DIR)) {
  fail(`No .next build found at ${NEXT_DIR}. Run "npx next build" first (see docs/ci.md).`);
}

const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));

// urlRoute -> filesystem app-path key, e.g. "/marketing" -> "/(app)/marketing/page"
const routesManifest = JSON.parse(
  readFileSync(join(NEXT_DIR, "app-path-routes-manifest.json"), "utf8"),
);
const urlToFsKey = new Map();
for (const [fsKey, urlRoute] of Object.entries(routesManifest)) {
  urlToFsKey.set(urlRoute, fsKey);
}

const buildManifest = JSON.parse(readFileSync(join(NEXT_DIR, "build-manifest.json"), "utf8"));
const sharedChunkPaths = new Set([
  ...(buildManifest.rootMainFiles ?? []),
  ...(buildManifest.polyfillFiles ?? []),
]);

function chunkSize(nextRelativeOrStaticPath) {
  // RSC manifest paths look like "/_next/static/chunks/x.js"; build-manifest
  // paths look like "static/chunks/x.js". Both resolve under .next/.
  const rel = nextRelativeOrStaticPath.replace(/^\/_next\//, "");
  const abs = join(NEXT_DIR, rel);
  if (!existsSync(abs)) return 0;
  return statSync(abs).size;
}

function routeChunks(urlRoute) {
  const fsKey = urlToFsKey.get(urlRoute);
  if (!fsKey) return null;
  const manifestPath = join(NEXT_DIR, "server", "app", fsKey.replace(/\/page$/, "/page_client-reference-manifest.js"));
  if (!existsSync(manifestPath)) return null;
  const src = readFileSync(manifestPath, "utf8");
  const m = src.match(/globalThis\.__RSC_MANIFEST\["[^"]+"\]\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) return null;
  const json = JSON.parse(m[1]);
  const chunks = new Set();
  for (const mod of Object.values(json.clientModules ?? {})) {
    for (const c of mod.chunks ?? []) chunks.add(c);
  }
  return chunks;
}

const sharedKB = [...sharedChunkPaths].reduce((sum, p) => sum + chunkSize(p), 0) / 1024;

const rows = [];
let anyOver = false;

for (const [urlRoute, routeBudget] of Object.entries(budget.routes)) {
  const chunks = routeChunks(urlRoute);
  if (!chunks) {
    rows.push({ route: urlRoute, budget: routeBudget.maxKB, actual: null, delta: null, status: "MISSING" });
    anyOver = true;
    continue;
  }
  // Route-specific weight: everything the route loads minus the shared baseline
  // every route already pays for (that's budgeted separately below).
  const routeOnly = [...chunks].filter((c) => !sharedChunkPaths.has(c.replace(/^\/_next\//, "")));
  const actualKB = routeOnly.reduce((sum, p) => sum + chunkSize(p), 0) / 1024;
  const overBy = (actualKB - routeBudget.maxKB) / routeBudget.maxKB;
  const over = overBy > 0.02;
  if (over) anyOver = true;
  rows.push({
    route: urlRoute,
    budget: routeBudget.maxKB,
    actual: Math.round(actualKB * 10) / 10,
    delta: Math.round((actualKB - routeBudget.maxKB) * 10) / 10,
    status: over ? "OVER" : "ok",
  });
}

const sharedOverBy = (sharedKB - budget.shared.maxKB) / budget.shared.maxKB;
const sharedOver = sharedOverBy > 0.02;
if (sharedOver) anyOver = true;

function fmt(n) {
  return n === null ? "-" : String(n);
}

console.log("route".padEnd(28), "budget(KB)".padEnd(12), "actual(KB)".padEnd(12), "delta(KB)".padEnd(12), "status");
for (const r of rows) {
  console.log(
    r.route.padEnd(28),
    String(r.budget).padEnd(12),
    fmt(r.actual).padEnd(12),
    fmt(r.delta).padEnd(12),
    r.status,
  );
}
console.log(
  "(shared chunks)".padEnd(28),
  String(budget.shared.maxKB).padEnd(12),
  String(Math.round(sharedKB * 10) / 10).padEnd(12),
  String(Math.round((sharedKB - budget.shared.maxKB) * 10) / 10).padEnd(12),
  sharedOver ? "OVER" : "ok",
);

if (anyOver) {
  console.error("\nbundle: one or more routes exceed their budget by more than 2%. Update perf-budget.json deliberately (docs/ci.md) if this growth is expected.");
  process.exit(1);
}
console.log("\nbundle: within budget");
process.exit(0);
