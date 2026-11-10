import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { normalizeEmail } from "@/lib/suppression";
import { cancelQueuedDraftsFor } from "@/lib/suppression/cancel";

// POST /api/suppressions: an app (the growth cold-email tool) reports an opt-out
// into the ONE shared suppression list, honoured by every outbound path through
// sendEmail (cold email, nurture, intro material). App-key auth, like /api/leads.
// Idempotent: an address already on the list answers 200 {created:false}, a new
// one 201 {created:true}; growth counts any 2xx as posted. Only adds, never removes.

const CHANNELS = ["email", "phone", "linkedin", "in_person"] as const;

const bodySchema = z.object({
  email: z.string().trim().email().max(300),
  /** YYYY-MM-DD, the day the person asked; defaults to today. */
  requested_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  channel: z.enum(CHANNELS).default("email"),
  source: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
}).strict();

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const email = normalizeEmail(b.email);
  const requestedAt = b.requested_at ? new Date(`${b.requested_at}T00:00:00Z`) : new Date();
  if (Number.isNaN(requestedAt.getTime()) || requestedAt.getTime() > Date.now() + 86_400_000) {
    return json({ error: "Validation failed", details: { fieldErrors: { requested_at: ["invalid or in the future"] } } }, 400);
  }

  try {
    const existing = await db.suppression.findFirst({ where: { tenantId: key.tenantId, email }, select: { id: true } });
    if (existing) return json({ ok: true, created: false, id: existing.id }, 200);
    let row: { id: number };
    try {
      row = await db.suppression.create({
        data: {
          tenantId: key.tenantId, email, requestedAt, channel: b.channel,
          source: b.source ? `${key.appSlug}: ${b.source}`.slice(0, 200) : key.appSlug,
          note: b.note ?? null,
        },
        select: { id: true },
      });
    } catch (err) {
      // Two posts for one address raced: the unique index keeps one row, both callers succeed.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await db.suppression.findFirst({ where: { tenantId: key.tenantId, email }, select: { id: true } });
        return json({ ok: true, created: false, id: winner?.id ?? null }, 200);
      }
      throw err;
    }
    const auditOpts = { tenantId: key.tenantId, actor: "agent" as const, actorAgentId: key.appSlug };
    audit("suppression", row.id, "create", null, { email, channel: b.channel, source: b.source ?? null }, auditOpts);
    const cancelled = await cancelQueuedDraftsFor(key.tenantId, { email, domain: null }, auditOpts);
    return json({ ok: true, created: true, id: row.id, cancelledDrafts: cancelled }, 201);
  } catch (err) {
    reportError("api.suppressions", err, { sourceApp: key.appSlug });
    return json({ error: "Internal error" }, 500);
  }
}
