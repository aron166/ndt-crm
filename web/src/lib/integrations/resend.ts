import "server-only";
import { db } from "@/lib/db";
import { decrypt, isEncrypted } from "@/lib/crypto";
import { audit } from "@/lib/audit";

const TENANT_ID = 1;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string | null;
}

function dec(raw: string | undefined): string | null {
  if (!raw) return null;
  return isEncrypted(raw) ? decrypt(raw) : raw;
}

/** Read + decrypt the tenant's Resend credentials (Settings → Integrations). */
export async function getResendConfig(): Promise<ResendConfig | null> {
  const cred = await db.integrationCredential.findUnique({
    where: { tenantId_integrationSlug: { tenantId: TENANT_ID, integrationSlug: "resend" } },
  });
  if (!cred?.isActive) return null;
  const c = cred.credentials as Record<string, string>;
  const apiKey = dec(c.apiKey);
  const fromEmail = dec(c.fromEmail);
  if (!apiKey || !fromEmail) return null;
  return { apiKey, fromEmail, fromName: dec(c.fromName) };
}

export async function isConnected(): Promise<boolean> {
  return (await getResendConfig()) !== null;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  /** Context to attach the logged interaction to. */
  companyId?: number | null;
  personId?: number | null;
  /** Skip the interaction log (used for connection test sends). */
  skipLog?: boolean;
}

/** Send a test email to the configured From address to verify the credentials. */
export async function sendTestEmail(): Promise<SendEmailResult> {
  const config = await getResendConfig();
  if (!config) return { ok: false, error: "A Resend integráció nincs beállítva." };
  return sendEmail({
    to: config.fromEmail,
    subject: "Helm CRM — teszt email",
    text: "Ez egy teszt üzenet a Helm CRM-ből. Ha megkaptad, a Resend integráció működik. 🎉",
    skipLog: true,
  });
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Send an email via Resend and record it as an append-only Interaction
 * (type=email, direction=outbound) against the given person/company — so the
 * CRM keeps a full, immutable communication trail (decisions.md #2).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = await getResendConfig();
  if (!config) return { ok: false, error: "A Resend integráció nincs beállítva (Beállítások → Integrációk)." };

  const to = input.to.trim();
  const subject = input.subject.trim();
  if (!to) return { ok: false, error: "Hiányzó címzett." };
  if (!subject) return { ok: false, error: "Hiányzó tárgy." };

  const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;

  let id: string;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.message || `Resend hiba (${res.status}).` };
    }
    id = data?.id ?? "";
    if (!id) return { ok: false, error: "A Resend nem adott vissza üzenetazonosítót." };
  } catch {
    return { ok: false, error: "Nem sikerült kapcsolódni a Resendhez." };
  }

  if (input.skipLog) return { ok: true, id };

  // Append-only interaction log (never blocks the send result).
  const companyId = input.companyId ?? null;
  const personId = input.personId ?? null;
  try {
    const interaction = await db.interaction.create({
      data: {
        tenantId: TENANT_ID,
        type: "email",
        direction: "outbound",
        notes: `Tárgy: ${subject}\n\n${input.text}`,
        outcome: "elküldve",
        occurredAt: new Date(),
        companyId,
        personId,
      },
    });
    audit("interaction", interaction.id, "create", null,
      { type: "email", direction: "outbound", companyId, personId, source: "resend" }, { tenantId: TENANT_ID });
    if (companyId) {
      await db.company.updateMany({
        where: { id: companyId, tenantId: TENANT_ID },
        data: { lastInteractionDate: new Date(), updatedAt: new Date() },
      });
    }
  } catch {
    // The email was sent; a failed log must not turn a success into an error.
  }

  return { ok: true, id };
}
