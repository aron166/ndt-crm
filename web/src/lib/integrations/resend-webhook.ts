import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import { reportError } from "@/lib/report-error";
import { applyOptOut } from "@/lib/outreach/unsubscribe";

const TOLERANCE_SEC = 300;

/** Svix scheme (Resend signs with it): HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`; never throws. */
export function verifyResendSignature(
  rawBody: string,
  h: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!h.id || !h.timestamp || !h.signature || !secret.startsWith("whsec_")) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > TOLERANCE_SEC) return false;
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();
  return h.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function processResendEvent(
  tenantId: number,
  svixId: string,
  event: unknown,
  now = new Date(),
): Promise<{ duplicate: boolean; type: string }> {
  const ev = isObj(event) ? event : {};
  const type = typeof ev.type === "string" ? ev.type : "unknown";
  const data = isObj(ev.data) ? ev.data : {};
  const emailId = typeof data.email_id === "string" ? data.email_id : null;
  const to = Array.isArray(data.to) ? data.to.find((x) => typeof x === "string") : undefined;
  const email = (typeof to === "string" ? normalizeEmail(to) : "") || null;
  const draft = emailId
    ? await db.emailDraft.findFirst({ where: { tenantId, providerMessageId: emailId }, select: { id: true, companyId: true, campaign: true, step: true } })
    : null;
  const created = typeof ev.created_at === "string" ? new Date(ev.created_at) : null;
  const occurredAt = created && !Number.isNaN(created.getTime()) ? created : null;

  let row: { id: number; processedAt: Date | null };
  try {
    row = await db.emailProviderEvent.create({
      data: {
        tenantId, provider: "resend", eventId: svixId, eventType: type, providerMessageId: emailId, email,
        draftId: draft?.id ?? null, payload: event as never, occurredAt,
      },
      select: { id: true, processedAt: true },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    // Redelivery: done before -> skip; an earlier attempt died midway -> redo the effects.
    const existing = await db.emailProviderEvent.findUnique({
      where: { provider_eventId: { provider: "resend", eventId: svixId } },
      select: { id: true, processedAt: true },
    });
    if (!existing) throw err;
    if (existing.processedAt) return { duplicate: true, type };
    row = existing;
  }

  const bounce = isObj(data.bounce) ? data.bounce : {};
  const hardBounce = (type === "email.bounced" && bounce.type === "Permanent") || type === "email.suppressed";
  if (hardBounce || type === "email.complained") {
    if (!email) {
      reportError("webhooks.resend", new Error(`${type} without an address`), { eventId: svixId });
    } else {
      const kind = hardBounce ? "bounce" : "complaint";
      await applyOptOut(tenantId, email, { kind, source: `resend_${kind}`, draftId: draft?.id, agent: "resend" });
      if (hardBounce && draft) {
        const sub = typeof bounce.subType === "string" ? bounce.subType : "Permanent";
        await db.emailDraft.update({ where: { id: draft.id }, data: { lastError: `Visszapattant (${sub})` } });
      }
    }
  } else if ((type === "email.delivered" || type === "email.opened") && draft) {
    const outcome = type === "email.delivered" ? "email_delivered" : "email_opened";
    const campaign = await db.campaign.findFirst({ where: { tenantId, slug: draft.campaign }, select: { id: true } });
    const member = campaign
      ? await db.campaignMember.findFirst({ where: { tenantId, campaignId: campaign.id, companyId: draft.companyId }, select: { id: true } })
      : null;
    if (campaign && member) {
      const seen = await db.campaignEvent.findFirst({
        where: { tenantId, memberId: member.id, stepPosition: draft.step, outcome }, select: { id: true },
      });
      if (!seen) {
        await db.campaignEvent.create({
          data: { tenantId, campaignId: campaign.id, memberId: member.id, stepPosition: draft.step, outcome, actorAgentId: "resend", at: occurredAt ?? now },
        });
      }
    }
  }

  await db.emailProviderEvent.update({ where: { id: row.id }, data: { processedAt: now } });
  return { duplicate: false, type };
}
