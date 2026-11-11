import { NextRequest, NextResponse } from "next/server";
import { checkQuerySchema, checkTimeFor } from "@/lib/booking/route-service";
import { crmUser, fail, jsonBody, TENANT_ID } from "../_gate";

/** A hand-picked time: every factor per machine, bundle hints, and alternatives when nothing fits. */
export async function POST(req: NextRequest) {
  const user = await crmUser();
  if (user instanceof NextResponse) return user;
  const parsed = checkQuerySchema.safeParse(await jsonBody(req));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Érvénytelen adat" }, { status: 400 });
  const r = await checkTimeFor(TENANT_ID, parsed.data);
  return "error" in r ? fail(r) : NextResponse.json(r);
}
