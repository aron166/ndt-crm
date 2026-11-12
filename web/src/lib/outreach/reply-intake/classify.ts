import { createHash } from "node:crypto";
import type { ParsedMail } from "mailparser";

// Ported from the campaign.py reply rules. Pure: no db, no network.

export type Classified =
  | { kind: "bounce"; messageId: string; recipient: string | null }
  | { kind: "auto"; messageId: string }
  | { kind: "opt_out"; messageId: string; from: string; inReplyTo: string[] }
  | { kind: "reply"; messageId: string; from: string; inReplyTo: string[]; snippet: string }
  | { kind: "ignore"; messageId: string; reason: "own_domain" | "no_from" | "bulk" };

export const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "freemail.hu", "citromail.hu", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "t-online.hu", "invitel.hu", "vipmail.hu", "indamail.hu",
]);

/** Lowercase and strip accents (NFD, drop combining marks), so ő and ű fold too. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const QUOTE_CUT = /^\s*(on .+ wrote:|.*\birta\b.*:|-+ ?(original message|eredeti uzenet) ?-+|from: .+|felado: .+)\s*$/m;
// Only an explicit opt-out is auto-suppressed; a soft no can mean "not now" and a human reads it.
const HARD_NO = /leiratkoz|\bunsubscribe\b|\bne (irjon|irjanak|keressen|keressenek|kuldjon|kuldjenek)\b|\btorol(jon|je|jek|jenek)\b/;
const AUTO_SUBJECT = /^(automatikus valasz|automatic reply|auto[- ]?reply|autoreply|out of office|hazon kivul|irodan kivul|abwesenheit|szabadsag)/;
const BOUNCE_SUBJECT = ["undeliver", "delivery status notification", "returned mail", "kezbesithetetlen", "nem kezbesitheto"];
const BLOCK_TAGS = /<\s*(br|\/?p|\/?div|\/?li|\/?tr|\/?h\d|\/?table)\b[^>]*>/gi;

const unquoteLines = (t: string) => t.split("\n").filter((l) => !l.trimStart().startsWith(">")).join("\n");

/** Quote cut on text that may still carry accents; fold keeps the length for Hungarian, else the whole text stays. */
function cutQuote(t: string): string {
  const folded = fold(t);
  const m = QUOTE_CUT.exec(folded);
  return unquoteLines(m && folded.length === t.length ? t.slice(0, m.index) : t);
}

function htmlText(h: string): string {
  const low = h.toLowerCase();
  const tagOf = (marker: string) => (low.includes(marker) ? low.lastIndexOf("<", low.indexOf(marker)) : -1);
  const cuts = [low.indexOf("<blockquote"), low.indexOf("<hr"), tagOf("gmail_quote"), tagOf("divrplyfwdmsg")].filter((i) => i >= 0);
  if (cuts.length) h = h.slice(0, Math.min(...cuts));
  return h.replace(BLOCK_TAGS, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Recipient of the first block in the message/delivery-status part with Action failed and Status 5.x.x. shortcut: reads the part as plain text, so a base64 part is never a bounce; upgrade if a real MTA does that. */
function hardDsnRecipient(raw: Buffer): string | null {
  const text = raw.toString("utf8");
  const at = text.search(/^content-type:\s*message\/delivery-status/im);
  if (at < 0) return null;
  const rest = text.slice(at);
  const start = rest.search(/\r?\n\r?\n/);
  if (start < 0) return null;
  const end = rest.indexOf("\n--", start);
  for (const block of rest.slice(start, end < 0 ? undefined : end).split(/\r?\n\r?\n/)) {
    const action = /^Action:\s*(\S+)/im.exec(block)?.[1].toLowerCase();
    const status = /^Status:\s*(\d)\./im.exec(block)?.[1];
    const rcpt = /^(?:Final|Original)-Recipient:\s*rfc822;\s*(\S+)/im.exec(block)?.[1];
    if (action === "failed" && status === "5" && rcpt) return rcpt.toLowerCase();
  }
  return null;
}

const header = (p: ParsedMail, name: string): string => {
  const v = p.headers.get(name);
  return typeof v === "string" ? v : "";
};

export function classifyMail(parsed: ParsedMail, raw: Buffer, ourDomains: string[]): Classified {
  const messageId = parsed.messageId?.trim() || createHash("sha256").update(raw).digest("hex");
  const from = parsed.from?.value?.[0]?.address?.trim().toLowerCase() ?? "";
  const subject = parsed.subject ?? "";
  const foldedSubject = fold(subject);

  const ct = parsed.headers.get("content-type") as { value?: string; params?: Record<string, string> } | undefined;
  const reportType = ct?.value === "multipart/report" ? (ct.params?.["report-type"] ?? "").toLowerCase() : null;

  const isDsn = reportType === "delivery-status";
  if (reportType === null || isDsn) {
    const f = fold(from);
    if (isDsn || f.startsWith("mailer-daemon") || f.startsWith("postmaster") || BOUNCE_SUBJECT.some((k) => foldedSubject.includes(k))) {
      // Only a confirmed hard bounce suppresses; a delay, a 4.x.x or a forged mail is stored only.
      if (isDsn) {
        const recipient = hardDsnRecipient(raw);
        return recipient ? { kind: "bounce", messageId, recipient } : { kind: "auto", messageId };
      }
      const failed = header(parsed, "x-failed-recipients").split(",")[0].trim().toLowerCase();
      return failed && /\b5\.\d{1,3}\.\d{1,3}\b/.test(parsed.text ?? "")
        ? { kind: "bounce", messageId, recipient: failed }
        : { kind: "auto", messageId };
    }
  }

  const autoSubmitted = header(parsed, "auto-submitted").trim().toLowerCase();
  if (
    (autoSubmitted && autoSubmitted !== "no") || parsed.headers.has("x-autoreply") || parsed.headers.has("x-autorespond") ||
    header(parsed, "precedence").trim().toLowerCase() === "auto_reply" ||
    reportType === "disposition-notification" || AUTO_SUBJECT.test(foldedSubject)
  ) return { kind: "auto", messageId };

  if (!from) return { kind: "ignore", messageId, reason: "no_from" };
  // A list mail (newsletter, notification) is never a person answering us, even when its footer says "unsubscribe".
  const precedence = header(parsed, "precedence").trim().toLowerCase();
  if (parsed.headers.has("list-id") || parsed.headers.has("list-unsubscribe") || precedence === "bulk" || precedence === "list") {
    return { kind: "ignore", messageId, reason: "bulk" };
  }
  if (ourDomains.some((d) => from.endsWith("@" + d.toLowerCase()))) return { kind: "ignore", messageId, reason: "own_domain" };

  // mailparser derives `text` from the html when there is no plain part; only then use our own html cut.
  const htmlOnly = typeof parsed.html === "string" && !/^content-type:\s*text\/plain/im.test(raw.toString("utf8"));
  const body = htmlOnly ? htmlText(parsed.html as string) : (parsed.text ?? "");
  const own = cutQuote(body.replace(/\r\n?/g, "\n")).trim();
  const snippet = own.slice(0, 1000);

  const refs = [...new Set(`${parsed.inReplyTo ?? ""} ${[parsed.references ?? []].flat().join(" ")}`.match(/<[^>]+>/g) ?? [])];
  if (HARD_NO.test(foldedSubject) || HARD_NO.test(fold(own).replace(/\s+/g, " "))) return { kind: "opt_out", messageId, from, inReplyTo: refs };
  return { kind: "reply", messageId, from, inReplyTo: refs, snippet };
}
