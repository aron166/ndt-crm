import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { CALLABLE_STATUSES } from "@/lib/outreach/queue";

// Outreach targeting: which companies in this tenant still need a first (or
// next) draft written for a given campaign. Addendum item 1 — the drafting
// agent skill calls this to build its worklist, then POSTs the drafts it
// writes to /api/outreach/drafts.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const targetsQuerySchema = z.object({
  campaign: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

interface TargetContact {
  personId: number;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * GET /api/outreach/targets?campaign=&limit= — companies this tenant has NOT
 * yet had a draft written for in the given campaign (no `email_drafts` row for
 * that tenant+company+campaign, any step). Excludes soft-deleted companies and
 * "F.A." (under liquidation) — same guardrail the call cockpit uses
 * (CALLABLE_WHERE in src/app/actions/outreach.ts).
 */
export async function GET(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const q = targetsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return json({ error: "Validation failed", details: q.error.flatten() }, 400);
  const { campaign, limit } = q.data;

  // Same do-not-contact guard the call cockpit uses (CALLABLE_STATUSES in
  // lib/outreach/queue.ts): status 0 (KUKA) and 4 (Nem érdekelt) are people who
  // already said no. Filtering only on deletedAt + "F.A." would have handed the
  // drafting agent exactly those companies to cold-email. (Vanda, #88.)
  const where = {
    tenantId: key.tenantId,
    deletedAt: null,
    pipelineStatus: { in: [...CALLABLE_STATUSES] },
    NOT: [
      { name: { contains: "F.A." } },
      { emailDrafts: { some: { tenantId: key.tenantId, campaign } } },
    ],
  };

  try {
    const [companies, total] = await Promise.all([
      db.company.findMany({
        where,
        orderBy: { id: "asc" },
        take: limit,
        select: {
          id: true,
          name: true,
          website: true,
          city: true,
          county: true,
          zipCode: true,
          warmth: true,
          teaorCode: true,
          teaorDescription: true,
          scopeOfActivity: true,
          notes: true,
          ndtMethods: true,
          lat: true,
          lng: true,
          contacts: {
            where: { endedAt: null },
            orderBy: [{ isPrimary: "desc" }, { startedAt: "desc" }],
            take: 3,
            select: {
              role: true,
              email: true,
              phone: true,
              person: {
                select: { id: true, firstName: true, lastName: true, email: true, phone: true },
              },
            },
          },
        },
      }),
      db.company.count({ where }),
    ]);

    const items = companies.map(({ contacts, ...company }) => {
      const mappedContacts: TargetContact[] = contacts.map((ct) => ({
        personId: ct.person.id,
        name: `${ct.person.firstName} ${ct.person.lastName}`.trim(),
        role: ct.role,
        email: ct.email ?? ct.person.email,
        phone: ct.phone ?? ct.person.phone,
      }));
      return { ...company, contacts: mappedContacts };
    });

    return json({ ok: true, items, campaign, limit, total_remaining: total }, 200);
  } catch (err) {
    reportError("api.outreach.targets", err, { tenantId: key.tenantId, campaign });
    return json({ error: "Internal error" }, 500);
  }
}
