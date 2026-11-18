import "server-only";
import nodemailer from "nodemailer";
import { logOutboundEmail } from "@/lib/integrations/resend";
import { isAddressSuppressed, SUPPRESSED_ERROR } from "@/lib/suppression";

export interface MailboxConfig { host: string; port: number; secure: boolean; user: string; pass: string; dailyCap: number }

/** Null (route off) unless CAMPAIGN_SMTP_HOST, CAMPAIGN_SMTP_USER and CAMPAIGN_SMTP_PASS are all non-empty. */
export function mailboxConfig(env: Record<string, string | undefined> = process.env): MailboxConfig | null {
  const host = env.CAMPAIGN_SMTP_HOST?.trim();
  const user = env.CAMPAIGN_SMTP_USER?.trim();
  const pass = env.CAMPAIGN_SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(env.CAMPAIGN_SMTP_PORT) || 465;
  const cap = Number(env.CAMPAIGN_SMTP_DAILY_CAP);
  return { host, port, secure: port === 465, user, pass, dailyCap: Number.isInteger(cap) && cap > 0 ? cap : 30 };
}

export interface MailboxSendInput { tenantId: number; to: string; subject: string; text: string; replyTo?: string | null; fromName?: string | null; headers?: Record<string, string>; companyId?: number | null; personId?: number | null }
export type MailboxSendResult = { ok: true; id: string; warning?: string } | { ok: false; error: string; auth: boolean };

export async function sendViaMailbox(
  cfg: MailboxConfig,
  input: MailboxSendInput,
  opts?: { tls?: { rejectUnauthorized: boolean }; ignoreTLS?: boolean },
): Promise<MailboxSendResult> {
  const to = input.to.trim();
  const subject = input.subject.trim();
  if (!to) return { ok: false, error: "Hiányzó címzett.", auth: false };
  if (!subject) return { ok: false, error: "Hiányzó tárgy.", auth: false };
  if (await isAddressSuppressed(input.tenantId, to)) return { ok: false, error: SUPPRESSED_ERROR, auth: false };

  const displayName = input.fromName?.replace(/["<>\\\r\n]/g, "").trim() || null;
  const from = displayName ? `"${displayName}" <${cfg.user}>` : cfg.user;

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    ...opts,
  });
  let id: string;
  try {
    const info = await transporter.sendMail({
      from, to, subject, text: input.text, replyTo: input.replyTo || cfg.user, headers: input.headers,
    });
    id = info.messageId;
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    const auth = err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534;
    return {
      ok: false,
      auth,
      error: auth
        ? "A postafiók nem fogadta el a belépést (SMTP hitelesítés): ellenőrizd az alkalmazásjelszót"
        : "Nem sikerült a postafiókon keresztül küldeni: " + (err.responseCode ?? err.code ?? "ismeretlen hiba"),
    };
  } finally {
    transporter.close();
  }
  const warning = await logOutboundEmail({
    tenantId: input.tenantId, subject, text: input.text, companyId: input.companyId, personId: input.personId,
    source: "mailbox", providerId: id,
  });
  return { ok: true, id, ...(warning ? { warning } : {}) };
}
