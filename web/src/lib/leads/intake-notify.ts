import "server-only";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { createHash } from "node:crypto";
import { sendEmail } from "@/lib/integrations/resend";

// Web-form intake notifications (Áron 2026-11-09, after the Fable review):
//  1. an instant Telegram ping to sales (env TELEGRAM_BOT_TOKEN + TELEGRAM_LEADS_CHAT_ID;
//     a no-op when unset), and
//  2. an instant auto-reply email TO THE LEAD, behind tenants.settings.auto_reply_enabled
//     (default FALSE until Áron signs the text).
// Each attempt leaves an app_events row ("lead_ping_sent" / "auto_reply_sent") so
// delivery can be checked from the DB. Neither ever throws into the intake.
// Hungarian copy is PROPOSAL until Áron approves it.

const BASE = process.env.APP_BASE_URL ?? "https://ndt-crm.vercel.app";
export const AUTO_REPLY_REPLY_TO = "peter@betonradar.hu";
/** Who the auto-reply promises will call; also the From display name, so the two never disagree. */
export const AUTO_REPLY_CALLER = "Nagy Péter";

/**
 * The lead's typed name, safe to put in a mail we send to a lead-supplied
 * address: whitespace collapsed, capped, and dropped when it looks like a link
 * or an address (a form is not a way to mail third parties our text plus theirs).
 */
export function safeName(name: string | null): string | null {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 60 || /https?:|www\.|@|\/|\\/i.test(n)) return null;
  return n;
}

export const INTENT_LABEL: Record<string, string> = {
  service_concrete: "Szolgáltatás, konkrét feladat",
  service_vague: "Szolgáltatás, még nem konkrét",
  service: "Szolgáltatás",
  device: "Eszköz (bérlés vagy vásárlás)",
  rental: "Eszközbérlés",
  purchase: "Eszközvásárlás",
  info: "Csak tájékozódik",
  unknown: "Nem ismert",
};
const BUYER_LABEL: Record<string, string> = { company: "cég", private: "magánszemély" };

/** "8_10" -> "8-10 óra"; anything else as typed. */
export function callWindowLabel(v: string | null): string {
  if (!v) return "-";
  const m = /^(\d{1,2})_(\d{1,2})$/.exec(v.trim());
  return m ? `${m[1]}-${m[2]} óra` : v;
}

export interface IntakeFacts {
  leadId: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  intent: string | null;
  buyerType: string | null;
  callWindow: string | null;
  town: string | null;
}

/** Pure: the Telegram text. Telegram links a +36... number itself (tap to call). */
export function pingText(f: IntakeFacts, base = BASE): string {
  return [
    `Új űrlapos lead (#${f.leadId})`,
    `Szándék: ${f.intent ? (INTENT_LABEL[f.intent] ?? f.intent) : "-"}`,
    `Ügyfél: ${f.buyerType ? (BUYER_LABEL[f.buyerType] ?? f.buyerType) : "-"}`,
    `Név: ${f.name ?? "-"}`,
    `Telefon: ${f.phone ?? "-"}`,
    `Hívható: ${callWindowLabel(f.callWindow)}`,
    `Település: ${f.town ?? "-"}`,
    `Megnyitás: ${base}/leads/${f.leadId}`,
  ].join("\n");
}

/** What happens next, one line per path (raw60 D4: every route starts with a demo offer). */
export function nextStepLine(intent: string | null): string {
  switch (intent) {
    case "service_concrete":
    case "service_vague":
    case "service":
      return "A hívásban egyeztetjük, mit kell megvizsgálni, utána írásos ajánlatot küldünk.";
    case "device":
    case "rental":
    case "purchase":
      return "A hívásban felmérjük, milyen eszközre van szüksége, és egy helyszíni bemutató méréssel kezdünk.";
    case "info":
      return "A hívásban röviden összefoglaljuk, mire jó a mérés és hogyan dolgozunk.";
    default:
      return "A hívásban megbeszéljük a részleteket és a következő lépést.";
  }
}

/** Pure: the auto-reply (PROPOSAL, Áron signs it before auto_reply_enabled goes on). */
export function autoReplyText(f: Pick<IntakeFacts, "name" | "intent">, caller = AUTO_REPLY_CALLER): { subject: string; text: string } {
  const name = safeName(f.name);
  return {
    subject: "Megkaptuk az érdeklődését (BetonRadar)",
    text: [
      name ? `Tisztelt ${name}!` : "Tisztelt Érdeklődő!",
      "",
      "Köszönjük, megkaptuk!",
      `${caller} kollégánk hamarosan felhívja: munkaidőben egy órán belül, egyébként a következő munkanap 9:30-ig.`,
      nextStepLine(f.intent),
      "",
      "Üdvözlettel,",
      "BetonRadar",
      "Uphill Trade Kft.",
    ].join("\n"),
  };
}

async function trace(tenantId: number, eventType: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await db.appEvent.create({ data: { tenantId, sourceApp: "ndt-crm", eventType, payload: payload as never } });
  } catch (err) {
    reportError(`leads.intakeNotify.trace.${eventType}`, err, { leadId: payload.leadId as number });
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function loadFacts(tenantId: number, leadId: number) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      id: true, intent: true, buyerType: true, qualification: true, customFields: true, companyId: true,
      contact: { select: { email: true, phone: true, personId: true } },
    },
  });
  if (!lead) return null;
  const q = (lead.qualification ?? {}) as Record<string, unknown>;
  const cf = (lead.customFields ?? {}) as Record<string, unknown>;
  const facts: IntakeFacts = {
    leadId,
    name: str(cf.contact_name),
    phone: str(cf.contact_phone) ?? lead.contact?.phone ?? null,
    email: str(cf.contact_email) ?? lead.contact?.email ?? null,
    intent: str(q.intent) ?? lead.intent,
    buyerType: lead.buyerType ?? str(q.buyer_type),
    callWindow: str(q.call_window) ?? str(cf.call_window),
    town: str(q.location) ?? str(q.city) ?? str(cf.location),
  };
  return { lead, facts };
}

/** Telegram ping to the sales chat. No-op (no event) when the env is not set. */
export async function sendLeadPing(tenantId: number, leadId: number): Promise<{ ok: boolean }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_LEADS_CHAT_ID;
  if (!token || !chatId) return { ok: false };
  try {
    const loaded = await loadFacts(tenantId, leadId);
    if (!loaded) return { ok: false };
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: pingText(loaded.facts), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    const ok = res.ok && data.ok === true;
    await trace(tenantId, "lead_ping_sent", ok
      ? { leadId, ok, messageId: data.result?.message_id ?? null }
      : { leadId, ok, error: data.description ?? `HTTP ${res.status}` });
    return { ok };
  } catch (err) {
    reportError("leads.ping", err, { leadId });
    await trace(tenantId, "lead_ping_sent", { leadId, ok: false, error: err instanceof Error ? err.message : String(err) });
    return { ok: false };
  }
}

/**
 * Auto-reply to the lead. Off unless tenants.settings.auto_reply_enabled === true.
 * From: the owner's name (Péter by default) on the tenant's Resend address; reply-to Péter.
 * sendEmail applies the suppression list and logs the email interaction.
 */
export async function sendAutoReply(tenantId: number, leadId: number): Promise<{ ok: boolean }> {
  try {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    if (settings.auto_reply_enabled !== true) return { ok: false };
    const loaded = await loadFacts(tenantId, leadId);
    if (!loaded?.facts.email) {
      await trace(tenantId, "auto_reply_sent", { leadId, ok: false, error: "no email on the lead" });
      return { ok: false };
    }
    // One auto-reply per address per 24 h: a re-submitted form (or a flood with
    // someone else's address) gets no second mail. Matched on a hash, never the address.
    const toHash = createHash("sha256").update(loaded.facts.email.trim().toLowerCase()).digest("hex").slice(0, 32);
    const recent = await db.appEvent.findFirst({
      where: {
        tenantId, eventType: "auto_reply_sent", createdAt: { gte: new Date(Date.now() - 86_400_000) },
        payload: { path: ["toHash"], equals: toHash },
      },
      select: { id: true },
    });
    if (recent) {
      await trace(tenantId, "auto_reply_sent", { leadId, ok: false, toHash, error: "already sent to this address in 24 h" });
      return { ok: false };
    }
    const caller = str(settings.auto_reply_caller) ?? AUTO_REPLY_CALLER;
    const { subject, text } = autoReplyText(loaded.facts, caller);
    const r = await sendEmail({
      tenantId, to: loaded.facts.email, subject, text,
      replyTo: str(settings.auto_reply_to) ?? AUTO_REPLY_REPLY_TO,
      fromName: caller,
      companyId: loaded.lead.companyId, personId: loaded.lead.contact?.personId ?? null,
    });
    await trace(tenantId, "auto_reply_sent", r.ok ? { leadId, ok: true, toHash, resendId: r.id } : { leadId, ok: false, toHash, error: r.error });
    return { ok: r.ok };
  } catch (err) {
    reportError("leads.autoReply", err, { leadId });
    await trace(tenantId, "auto_reply_sent", { leadId, ok: false, error: err instanceof Error ? err.message : String(err) });
    return { ok: false };
  }
}
