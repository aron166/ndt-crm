import { NextRequest, NextResponse } from "next/server";
import { proposeSlotsFor, slotsQuerySchema } from "@/lib/booking/route-service";
import { crmUser, fail, jsonBody, TENANT_ID } from "../_gate";

/** Ranked, physically possible slots only, each with its factors. */
export async function POST(req: NextRequest) {
  const user = await crmUser();
  if (user instanceof NextResponse) return user;
  const parsed = slotsQuerySchema.safeParse(await jsonBody(req));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Érvénytelen adat" }, { status: 400 });
  const r = await proposeSlotsFor(TENANT_ID, parsed.data);
  return "error" in r ? fail(r) : NextResponse.json(r);
}
