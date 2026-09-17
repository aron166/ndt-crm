// Measure page weight + DB query count per screen (performance golden rule:
// every PR states these numbers). Runs against a LOCAL server only.
//
//   node .smoke-auth.mjs                      # session cookie for the local app
//   node scripts/measure-screens.mjs \
//     --base http://127.0.0.1:3100 --cookie .smoke-cookie.txt \
//     --pg ndtcrm-fixture-db \
//     /marketing /marketing/77 /marketing/live
//
// Query counting needs `log_statement=all` on the local Postgres container:
//   docker exec <c> psql -U postgres -d ndtcrm -c "ALTER SYSTEM SET log_statement='all'" -c "SELECT pg_reload_conf()"
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const base = flag("base", "http://127.0.0.1:3100");
const cookieFile = flag("cookie", ".smoke-cookie.txt");
const pg = flag("pg", null);
const paths = args.filter((a) => a.startsWith("/"));
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  console.error("Refusing: --base must be a local server.");
  process.exit(1);
}
if (paths.length === 0) {
  console.error("Give at least one path, e.g. /marketing");
  process.exit(1);
}
const cookie = fs.readFileSync(cookieFile, "utf8").trim();

/** Queries the app ran, counted from the Postgres statement log. */
function queriesSince(seconds) {
  if (!pg) return null;
  // Postgres logs to stderr, so both streams have to be read.
  const r = spawnSync("docker", ["logs", "--since", `${seconds}s`, pg], { encoding: "utf8" });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`
    .split("\n")
    .filter((l) => /LOG: +(execute [^:]*:|statement:) *(SELECT|INSERT|UPDATE|DELETE|WITH|BEGIN)/i.test(l))
    .length;
}

const rows = [];
for (const path of paths) {
  // Warm once so the measurement is not a cold compile of the route.
  await fetch(base + path, { headers: { cookie } });
  await new Promise((r) => setTimeout(r, 4000)); // let the warm-up drop out of the log window
  const t0 = Date.now();
  const res = await fetch(base + path, { headers: { cookie } });
  const html = await res.text();
  if (res.url.includes("/login")) {
    console.error(`${path}: not authenticated — mint a fresh cookie`);
    process.exit(1);
  }
  const ms = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 1200));
  const queries = queriesSince(3);

  // Transfer size, not decompressed size: curl reports what actually crosses
  // the wire, which is the number that matters for a phone on 4G.
  const scripts = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map((m) => m[0]))];
  let js = 0;
  for (const file of scripts) {
    const out = execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{size_download}", "--compressed", base + file], { encoding: "utf8" });
    js += Number(out.trim()) || 0;
  }
  rows.push({ path, htmlKB: +(Buffer.byteLength(html) / 1024).toFixed(1), jsKB: +(js / 1024).toFixed(1), files: scripts.length, queries, ms });
}

const pad = (v, n) => String(v).padEnd(n);
console.log(`${pad("screen", 24)}${pad("html KB", 10)}${pad("js KB", 10)}${pad("js files", 10)}${pad("queries", 9)}ttfb ms`);
for (const r of rows) {
  console.log(`${pad(r.path, 24)}${pad(r.htmlKB, 10)}${pad(r.jsKB, 10)}${pad(r.files, 10)}${pad(r.queries ?? "-", 9)}${r.ms}`);
}
