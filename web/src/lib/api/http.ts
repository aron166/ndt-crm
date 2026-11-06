import { NextResponse } from "next/server";
import { validateAppKey, rateLimit, type AppKeyContext } from "@/lib/app-key-auth";

// The edge every app-key route shares: JSON responses, CORS preflight, key auth
// plus rate limit, JSON body parsing, numeric path ids. Response bodies and
// statuses here are part of the public contract other apps code against.

export type Json = (body: unknown, status?: number) => NextResponse;

/**
 * `json()` and `OPTIONS` for a route. Pass the CORS methods for routes other
 * origins call (landing pages post cross-origin; the key is the gate); omit them
 * for routes only agents call server-side.
 */
export function jsonApi(corsMethods?: string): { json: Json; OPTIONS: () => Promise<NextResponse> } {
  const headers = corsMethods
    ? {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": corsMethods,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      }
    : undefined;
  return {
    json: (body, status = 200) => NextResponse.json(body, { status, headers }),
    OPTIONS: async () => new NextResponse(null, { status: 204, headers }),
  };
}

/** JSON response without CORS headers. */
export const json: Json = jsonApi().json;

/** The app key's context, or the 401 / 429 response to return as is. */
export async function requireAppKey(request: Request, respond: Json = json): Promise<AppKeyContext | NextResponse> {
  const key = await validateAppKey(request);
  if (!key) return respond({ error: "Unauthorized" }, 401);
  // The number is RATE_LIMIT in lib/app-key-auth.ts.
  if (!rateLimit(key.keyId)) return respond({ error: "Rate limit exceeded (30 req/min)" }, 429);
  return key;
}

/** The parsed body, or the 400 response to return as is. */
export async function readJson(request: Request, respond: Json = json): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }
}

export function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
}

/**
 * Gate for /api/cron/*: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * when that env var is set; anything else (or no secret configured) is refused.
 * Returns the 401 to send, or null to go on.
 */
export function requireCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return null;
  return new Response("Unauthorized", { status: 401 });
}
