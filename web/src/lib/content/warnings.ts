// Pure extraction of ⚠ markers from imported markdown drafts into blocking
// checklist items (spec §6c). No DB, no I/O — see addChecks() in
// lib/content/service.ts for persistence.

export interface ExtractedWarning {
  question: string;
  forWhom: "aron" | "peter" | "either";
}

const QUESTION_MAX = 500;
const MARKER_RE = /⚠️?/g;
// A bullet/heading/table-row start on its own line ends a continuation.
const BLOCK_START_RE = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/;
// Leading scaffolding like "JÓVÁHAGYÁSRA VÁR —" or "DRAFT —": an all-caps
// (Hungarian-accented) run followed by a dash, stripped once.
const SCAFFOLD_RE = /^[A-ZÁÉÍÓÖŐÚÜŰ0-9][A-ZÁÉÍÓÖŐÚÜŰ0-9\s/]*[—–-]\s*/;
const HAS_WORD_RE = /[\p{L}\p{N}]/u;

function stripEmphasis(s: string): string {
  // Strip markdown emphasis wrapping (**bold**, *italic*, _italic_) and a
  // trailing markdown table pipe, without trying to be a full MD parser.
  return s
    .trim()
    .replace(/\*\*/g, "") // bold pairs can straddle the scaffold, e.g. "**SCAFFOLD.** rest"
    .replace(/^\*|\*$/g, "")
    .replace(/^_{1,2}|_{1,2}$/g, "")
    .trim()
    .replace(/\s*\|\s*$/, "")
    .trim();
}

function stripScaffold(s: string): string {
  return s.replace(SCAFFOLD_RE, "").trim();
}

function truncate(s: string): string {
  if (s.length <= QUESTION_MAX) return s;
  const cut = s.slice(0, QUESTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}

function forWhomOf(text: string): ExtractedWarning["forWhom"] {
  const aron = /áron/i.test(text);
  const peter = /péter/i.test(text);
  if (aron && !peter) return "aron";
  if (peter && !aron) return "peter";
  return "either";
}

export function extractWarnings(markdown: string): ExtractedWarning[] {
  const lines = markdown.split("\n");
  const seen = new Set<string>();
  const out: ExtractedWarning[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const markers = [...line.matchAll(MARKER_RE)];
    if (markers.length === 0) continue;

    for (let m = 0; m < markers.length; m++) {
      const start = markers[m].index! + markers[m][0].length;
      const end = m + 1 < markers.length ? markers[m + 1].index! : line.length;
      const parts = [line.slice(start, end)];

      // Only the LAST marker on the line may pull in continuation lines.
      if (m === markers.length - 1) {
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j];
          if (next.trim() === "") break;
          if (BLOCK_START_RE.test(next)) break;
          if (next.includes("⚠")) break;
          parts.push(next.trim());
        }
      }

      const joined = parts.join(" ").replace(/\s+/g, " ").trim();
      const question = truncate(stripScaffold(stripEmphasis(joined)));
      if (!HAS_WORD_RE.test(question)) continue;

      const key = question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ question, forWhom: forWhomOf(question) });
    }
  }

  return out;
}
