#!/usr/bin/env node
// FOUNDATION style law: no emoji/dingbats and no em dashes in UI text.
// Scans web/src/**/*.{ts,tsx}, web/prisma/seed*.ts and
// web/scripts/content-fixtures.mjs. Comments (// line, /* block */, JSDoc)
// are masked out before scanning so the repo's comment prose doesn't trip
// the check; string/template literals are left intact.
//
// Usage: node scripts/check-style.mjs   (exits 1 and lists hits, or exits 0)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");

// Explicit allow-list. Each entry needs a one-line reason. Keep this short:
// it's a list of exceptions to a law, not a place to launder new violations.
export const ALLOWLIST = [
  {
    file: "src/lib/hub/schema.test.ts",
    glyph: "\u{1F600}", // 😀
    reason: "size-stress test fixture exercising multi-byte glyph handling, not UI text",
  },
  {
    file: "src/lib/report-error.ts",
    glyph: "\u{1F534}", // 🔴
    reason: "internal ops Slack/Discord webhook alert string, never rendered in the app UI",
  },
  {
    file: "src/lib/content/warnings.ts",
    glyph: "\u26A0", // ⚠
    reason: "matches literal markers left in imported AI-drafted markdown content, not UI copy",
  },
  {
    file: "src/lib/content/warnings.ts",
    glyph: "\uFE0F", // variation selector following ⚠ in the same marker regex
    reason: "matches literal markers left in imported AI-drafted markdown content, not UI copy",
  },
  {
    file: "src/lib/content/warnings.ts",
    glyph: "\u2014", // em dash
    reason: "SCAFFOLD_RE strips a literal dash left by imported drafts (e.g. \"DRAFT \\u2014\"), not UI copy",
  },
  {
    file: "src/lib/content/warnings.ts",
    glyph: "\u2013", // en dash
    reason: "SCAFFOLD_RE strips a literal dash left by imported drafts (e.g. \"DRAFT \\u2013\"), not UI copy",
  },
  // Any file matched by /\.test\.[jt]sx?$/ is exempt outright (see isTestFile below):
  // test files assert on fixture content, not on law-compliant UI copy.
];

// U+2190-U+27BF ("Arrows" + "Miscellaneous Symbols" + "Dingbats") is NOT used
// as a range: it's mostly plain typography (→ ← ↔ ↳ ≥-adjacent math, box-
// drawing, etc.), not emoji, and code-comments/UI copy in this repo lean on
// it constantly (NATE-CI-1 correction, 2026-09-17). Only the specific glyphs
// in EXTRA_GLYPHS below (real emoji/dingbats pulled from that block) count.
const EMOJI_RANGES = [
  [0x1f300, 0x1faff],
  [0x2b00, 0x2bff],
];
const EXTRA_GLYPHS = ["️", "✅", "✏", "♻", "⚠", "✓", "✦", "✉"];
const EM_DASH = "—";
const EN_DASH = "–";

function isTestFile(relPath) {
  return /\.test\.[jt]sx?$/.test(relPath);
}

function isAllowed(relPath, glyph) {
  return ALLOWLIST.some((e) => e.file === relPath && e.glyph === glyph);
}

function findFiles(dir, matcher, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, matcher, out);
    else if (matcher(entry.name)) out.push(full);
  }
  return out;
}

function collectTargets() {
  const files = [];
  files.push(...findFiles(join(ROOT, "src"), (n) => /\.(ts|tsx)$/.test(n)));
  const prismaDir = join(ROOT, "prisma");
  try {
    for (const n of readdirSync(prismaDir)) {
      if (/^seed.*\.ts$/.test(n)) files.push(join(prismaDir, n));
    }
  } catch {
    /* no prisma dir */
  }
  const fixtures = join(ROOT, "scripts", "content-fixtures.mjs");
  try {
    statSync(fixtures);
    files.push(fixtures);
  } catch {
    /* not present */
  }
  return files;
}

// Mask out // line comments, /* */ block comments (incl. JSDoc) with spaces,
// preserving every other character (and all newlines) at its original
// position so line/column numbers of a later regex scan stay valid. String
// and template literals are tracked so a "//" inside a string (e.g. a URL)
// is never mistaken for a comment.
// Stack-based so `` `sql ${ {a:1} } more` `` and nested/backtick-in-expr
// cases resolve back to the right frame instead of drifting out of sync
// after the first `${...}` (which is what a linear state machine gets wrong).
function maskComments(src) {
  const out = src.split("");
  const n = src.length;
  let i = 0;
  let sub = null; // null | "line-comment" | "block-comment" | "sq" | "dq"
  const stack = [{ type: "code" }]; // top = current frame

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];

    if (sub === "line-comment") {
      if (c === "\n") sub = null;
      else out[i] = c === "\t" ? "\t" : " ";
      i++;
      continue;
    }
    if (sub === "block-comment") {
      if (c === "*" && c2 === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        sub = null;
        i += 2;
        continue;
      }
      if (c !== "\n") out[i] = " ";
      i++;
      continue;
    }
    if (sub === "sq" || sub === "dq") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if ((sub === "sq" && c === "'") || (sub === "dq" && c === '"')) sub = null;
      i++;
      continue;
    }

    const top = stack[stack.length - 1];
    if (top.type === "code") {
      // "https://..." typed directly as JSX text (not inside a string literal,
      // so the sq/dq/template tracking above never sees it) would otherwise
      // look like a line comment starting at the "//" — bail out when "//" is
      // immediately preceded by ":" the way a URL scheme is.
      if (c === "/" && c2 === "/" && src[i - 1] !== ":") {
        sub = "line-comment";
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      if (c === "/" && c2 === "*") {
        sub = "block-comment";
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
        continue;
      }
      if (c === "'") {
        sub = "sq";
        i++;
        continue;
      }
      if (c === '"') {
        sub = "dq";
        i++;
        continue;
      }
      if (c === "`") {
        stack.push({ type: "template" });
        i++;
        continue;
      }
      if (top.fromTemplate) {
        if (c === "{") {
          top.exprBraces = (top.exprBraces || 0) + 1;
          i++;
          continue;
        }
        if (c === "}") {
          if ((top.exprBraces || 0) === 0) {
            stack.pop(); // back to the enclosing template's literal text
            i++;
            continue;
          }
          top.exprBraces--;
          i++;
          continue;
        }
      }
      i++;
      continue;
    }

    // top.type === "template": literal text of a template string.
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      stack.pop();
      i++;
      continue;
    }
    if (c === "$" && c2 === "{") {
      stack.push({ type: "code", fromTemplate: true, exprBraces: 0 });
      i += 2;
      continue;
    }
    i++;
  }
  return out.join("");
}
// ponytail: doesn't special-case regex literals (a `//` inside /.../ would be
// misread as a comment start) — this repo doesn't lean on regex literals
// containing `//`; revisit if check-style starts producing bogus hits there.

function glyphAt(text, idx) {
  const cp = text.codePointAt(idx);
  const ch = String.fromCodePoint(cp);
  for (const [lo, hi] of EMOJI_RANGES) {
    if (cp >= lo && cp <= hi) return ch;
  }
  if (EXTRA_GLYPHS.includes(ch)) return ch;
  if (ch === EM_DASH) return ch;
  return null;
}

function scanFile(absPath) {
  const relPath = relative(ROOT, absPath).replace(/\\/g, "/");
  if (isTestFile(relPath)) return [];
  const src = readFileSync(absPath, "utf8");
  const masked = maskComments(src);
  const origLines = src.split("\n");
  const maskedLines = masked.split("\n");
  const hits = [];

  for (let li = 0; li < maskedLines.length; li++) {
    const line = maskedLines[li];
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      // en dash used as a dash between words: space-EN_DASH-space
      if (ch === EN_DASH) {
        const prev = line[ci - 1];
        const next = line[ci + 1];
        if (prev === " " && next === " ") {
          if (!isAllowed(relPath, EN_DASH)) {
            hits.push({ line: li + 1, glyph: EN_DASH, text: origLines[li].trim() });
          }
        }
        continue;
      }
      const cp = line.codePointAt(ci);
      if (cp > 0xffff) {
        const g = glyphAt(line, ci);
        if (g && !isAllowed(relPath, g)) {
          hits.push({ line: li + 1, glyph: g, text: origLines[li].trim() });
        }
        ci++; // skip low surrogate
        continue;
      }
      const g = glyphAt(line, ci);
      if (g && !isAllowed(relPath, g)) {
        hits.push({ line: li + 1, glyph: g, text: origLines[li].trim() });
      }
    }
  }
  return hits.map((h) => ({ ...h, file: relPath }));
}

function main() {
  const files = collectTargets();
  let allHits = [];
  for (const f of files) {
    allHits = allHits.concat(scanFile(f));
  }
  if (allHits.length > 0) {
    for (const h of allHits) {
      console.error(`${h.file}:${h.line}: ${h.glyph} ${h.text}`);
    }
    console.error(`\nstyle: ${allHits.length} violation(s) in ${files.length} files scanned`);
    process.exit(1);
  }
  console.log(`style: clean (${files.length} files scanned)`);
  process.exit(0);
}

main();
