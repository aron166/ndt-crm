import { NextRequest, NextResponse } from "next/server";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";

// Single tenant today (decisions.md #12); every query below is scoped by it.
export const TENANT_ID = 1;

/**
 * The /api/booking gate. The proxy only proves a session; this proves a CRM
 * user of the tenant. Returns the user id, or the 403 to send back.
 */
export async function crmUser(): Promise<number | NextResponse> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? NextResponse.json({ error: NOT_A_CRM_USER }, { status: 403 }) : userId;
}

export async function jsonBody(req: NextRequest): Promise<unknown> {
  return req.json().catch(() => null);
}

export function fail(r: { error: string; status: number }) {
  return NextResponse.json({ error: r.error }, { status: r.status });
}
