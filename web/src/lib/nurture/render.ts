// W9 nurture, PURE rendering: a template's markdown body -> plain text + minimal HTML.
// Every link gets UTM tags (W3: campaign = template key, content = step) and goes
// through the click-tracking redirect; the footer carries the sender identity
// (issuer from tenant config) and the unsubscribe link. All lead-independent text
// comes from the approved template; nothing from the lead is interpolated except
// the greeting name, which is HTML-escaped. Hungarian footer copy is PROPOSAL.

export interface RenderContext {
  templateKey: string;
  position: number;
  /** Builds the click-tracking URL for a final (UTM-tagged) destination. */
  trackUrl: (destination: string) => string;
  unsubscribeUrl: string;
  issuer: { legalName: string | null; brand: string | null; address: string | null; website: string | null };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only our own site gets UTM tags; other links pass through untouched (still click-tracked). */
export function withUtm(url: string, templateKey: string, position: number): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  if (!/(^|\.)betonradar\.hu$/i.test(u.hostname)) return url;
  u.searchParams.set("utm_source", "nurture");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", templateKey);
  u.searchParams.set("utm_content", `step-${position}`);
  return u.toString();
}

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** Inline markdown (bold, links) for one line, as HTML. */
function inlineHtml(line: string, ctx: RenderContext): string {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(LINK)) {
    out += esc(line.slice(last, m.index)).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    const dest = withUtm(m[2], ctx.templateKey, ctx.position);
    out += `<a href="${esc(ctx.trackUrl(dest))}">${esc(m[1])}</a>`;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + esc(line.slice(last)).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function inlineText(line: string, ctx: RenderContext): string {
  return line
    .replace(LINK, (_m, text: string, url: string) => `${text}: ${ctx.trackUrl(withUtm(url, ctx.templateKey, ctx.position))}`)
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableRule = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function footerLines(ctx: RenderContext): string[] {
  const who = [ctx.issuer.brand, ctx.issuer.legalName, ctx.issuer.address].filter(Boolean).join(", ");
  return [
    "--",
    who || "BetonRadar",
    ...(ctx.issuer.website ? [ctx.issuer.website] : []),
    "Azért kapja ezt a levelet, mert érdeklődött nálunk, vagy feliratkozott a hírlevelünkre.",
    `Leiratkozás: ${ctx.unsubscribeUrl}`,
  ];
}

/** Markdown body -> { text, html }. Supports paragraphs, **bold**, [links](https://...), simple tables, "---" rules. */
export function renderBody(bodyMd: string, ctx: RenderContext): { text: string; html: string } {
  const lines = bodyMd.replace(/\r\n/g, "\n").split("\n");
  const text: string[] = [];
  const html: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isTableRow(l)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableRule(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      i--;
      for (const r of rows) text.push(r.map((c) => inlineText(c, ctx)).join(" | "));
      html.push(`<table cellpadding="6" style="border-collapse:collapse">${rows.map((r, ri) =>
        `<tr>${r.map((c) => `<${ri === 0 ? "th" : "td"} style="border:1px solid #ddd;text-align:left">${inlineHtml(c, ctx)}</${ri === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</table>`);
      continue;
    }
    if (/^\s*-{3,}\s*$/.test(l)) { text.push(""); continue; }
    if (!l.trim()) { text.push(""); html.push(""); continue; }
    text.push(inlineText(l, ctx));
    html.push(`<p>${inlineHtml(l, ctx)}</p>`);
  }
  const foot = footerLines(ctx);
  const unsub = `<a href="${esc(ctx.unsubscribeUrl)}">Leiratkozás</a>`;
  return {
    text: [...text, "", ...foot].join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    html: `${html.filter((h, i, a) => h || a[i - 1]).join("\n")}\n<hr><p style="color:#666;font-size:12px">${foot
      .slice(1, -1).map(esc).join("<br>")}<br>${unsub}</p>`,
  };
}
