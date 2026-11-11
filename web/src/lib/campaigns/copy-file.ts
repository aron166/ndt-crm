// Segment e-mail copy from a Mira file (docs/birdsview/launch-2026-11/demo/EMAIL.md shape): one
// touch-1 item per mailed segment, each body = the segment block + the shared closing block with
// {{CTA}} replaced by the CTA text passed in. PURE. The launch copy rules (Kai, 2026-11-11) are
// checked here; an item that breaks one is refused, never loaded.

import { isSegmentKey, type SegmentKey } from "./email-preview";

export interface CopyItem { segment: SegmentKey; label: string; subject: string; body: string }
export interface CopyRefusal { what: string; reason: string }

const CLOSING_MARK = "Minden levél teste ugyanígy zárul";
const fence = (s: string) => s.match(/```[a-z]*\n([\s\S]*?)\n```/)?.[1] ?? null;

/** Launch copy rules: returns what a text breaks (empty = clean). */
export function copyRuleBreaks(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  if (/\d\s*(ft|forint|huf|eur|€)(?!\p{L})|(?<!\p{L})(ár|ára|árak|áraink|árunk|díj\p{L}*)(?!\p{L})/u.test(t)) out.push("ár vagy díj");
  if (/engedély/.test(t)) out.push("„engedély”");
  if (/garanci/.test(t)) out.push("„garancia”");
  if (/(?<!\p{L})első(?!\p{L})/u.test(t)) out.push("„első” (minősítés nélkül tilos)");
  if (/±|\+\/-|\+-\s*\d|plusz-mínusz/.test(t)) out.push("plusz-mínusz pontosság");
  if (/foglaljon|foglalj\b|foglaljanak|naptár|calendly|időpontot választ/.test(t)) out.push("az ügyfél foglal (mi foglalunk, soha az ügyfél)");
  if (!/„érdekel”|"érdekel"/.test(text)) out.push("nincs „érdekel” válasz kérés");
  return out;
}

/** Parse the file. `cta` replaces {{CTA}} (Áron's signed CTA a1, kept verbatim). */
export function parseSegmentCopy(md: string, cta: string): { items: CopyItem[]; refused: CopyRefusal[] } {
  const items: CopyItem[] = [];
  const refused: CopyRefusal[] = [];
  const closeAt = md.indexOf(CLOSING_MARK);
  const closing = closeAt >= 0 ? fence(md.slice(closeAt)) : null;
  if (!closing) return { items, refused: [{ what: "fájl", reason: "nincs közös záró blokk" }] };
  if (!cta.trim()) return { items, refused: [{ what: "fájl", reason: "nincs CTA szöveg" }] };
  const tail = closing.replace("{{CTA}}", cta.trim());
  const sections = md.split(/^## /m).slice(1);
  for (const sec of sections) {
    const head = sec.slice(0, sec.indexOf("\n")).trim();
    const m = head.match(/^Segment ([A-Z]) \((.+)\)$/);
    if (!m) {
      if (/^Utánkövetés/.test(head)) refused.push({ what: "Utánkövetés (minden szegmens)", reason: "nincs tárgysor a fájlban, és a kampánynak nincs második e-mail lépése" });
      if (/^Útvonalas/.test(head)) refused.push({ what: "Útvonalas változat", reason: "csak W8b útvonalhoz, Áron jóváhagyásával; nem 1. levél" });
      continue;
    }
    const [, key, label] = m;
    const block = fence(sec);
    const subject = sec.match(/^Tárgy:\s*(.+)$/m)?.[1]?.trim();
    if (!isSegmentKey(key) || !block || !subject) {
      refused.push({ what: `${key} szegmens`, reason: !isSegmentKey(key) ? "magánszemély: nem kap hideg levelet" : "nincs levélszöveg vagy tárgy" });
      continue;
    }
    const body = `${block}\n\n${tail}`;
    const breaks = copyRuleBreaks(`${subject}\n${body}`);
    if (breaks.length) refused.push({ what: `${key} szegmens`, reason: breaks.join(", ") });
    else items.push({ segment: key, label, subject, body });
  }
  return { items, refused };
}
