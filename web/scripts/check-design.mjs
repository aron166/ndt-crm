#!/usr/bin/env node
// Design-layer gate (Áron 2026-11-10: one design layer, re-themeable in one place, calm palette).
// App code reads colours, radii and shadows ONLY through --ui-* tokens (web/src/styles/tokens.css).
// Fails on: legacy vars (--bg-*, --fg*, --indigo*, ...), raw Astryx vars (--color-*, --radius-*, --shadow-*),
// Tailwind palette colour classes, raw colour literals (hex, rgb/hsl/oklch, named), in web/src/**/*.{ts,tsx,css}.
// Usage: node scripts/check-design.mjs [--list]   (--list prints every hit; default prints per-file counts)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname;
// The token file and the legacy bridge in globals.css are where these values are allowed to live.
// PDFs render outside the browser theme (react-pdf), so they keep literal colours.
const ALLOW_FILES = [/^styles\/tokens\.css$/, /^app\/globals\.css$/, /^lib\/.*\/pdf\.tsx$/, /\.test\.tsx?$/];
// User-chosen data colours (tag colours, stage colours from the DB) are allowed where a line says so,
// with a reason of 8+ characters. It silences only the colour-literal rules, never vars or palette classes.
const ALLOW_LINE = /design-allow:\s*\S.{7,}/;
const NAMED = "white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|cyan|magenta|brown|gold";

// [name, regex, silenceable by design-allow]
const RULES = [
  ["legacy var", /var\(--(bg|fg|indigo|line|mint|coral|amber|sky|violet|orange|glow|shadow-card|shadow-primary|row-hover|tint|panel-edge|data-ink)[a-z0-9-]*\s*[,)]/g, false],
  ["raw Astryx var", /var\(--(color|radius|shadow)-[a-z0-9-]+\s*[,)]/g, false],
  ["palette class", /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|accent|caret|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g, false],
  ["tailwind white/black", /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)\b/g, false],
  ["raw hex", /#[0-9a-fA-F]{3,8}\b/g, true],
  ["colour function", /\b(?:rgba?|hsla?|oklch|oklab)\(/g, true],
  ["named colour", new RegExp(`\\b(?:color|background|backgroundColor|borderColor|border|fill|stroke|outlineColor)\\s*:\\s*["'](?:${NAMED})["']`, "g"), true],
];

/** Pure scan of one source line. Returns [ruleName, matchedText][]. */
export function scanLine(file, line) {
  const css = file.endsWith(".css");
  if (css ? /^\s*(\/\*|\* [A-Za-z])/.test(line) : /^\s*(\/\/|\/\*|\* )/.test(line)) return [];
  const allowed = ALLOW_LINE.test(line);
  const hits = [];
  for (const [name, re, silenceable] of RULES) {
    if (allowed && silenceable) continue;
    for (const m of line.matchAll(re)) hits.push([name, m[0]]);
  }
  return hits;
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(f)) out.push(p);
  }
  return out;
}

function main() {
  const list = process.argv.includes("--list");
  let total = 0;
  const perFile = [];
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    if (ALLOW_FILES.some((r) => r.test(rel))) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    let n = 0;
    lines.forEach((line, i) => {
      for (const [name, text] of scanLine(rel, line)) {
        n++;
        if (list) console.log(`${rel}:${i + 1}  ${name}  ${text}`);
      }
    });
    if (n) perFile.push([n, rel]);
    total += n;
  }
  if (!list) perFile.sort((a, b) => b[0] - a[0]).forEach(([n, f]) => console.log(String(n).padStart(4), f));
  console.log(total ? `design: ${total} hits outside the design layer` : "design: clean");
  process.exit(total ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
