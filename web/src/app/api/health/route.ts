import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// Liveness + DB-connectivity probe for uptime monitors (no auth — it exposes
// nothing beyond up/down). In the proxy bypass list so monitors aren't
// redirected to /login.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    // tz: proves the instrumentation TZ pin is live on this deploy (no secret in it).
    return NextResponse.json({ ok: true, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  } catch (err) {
    console.error("[/api/health] db check failed:", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
