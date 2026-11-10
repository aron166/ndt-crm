import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createBooking } from "@/lib/booking/route-service";
import { crmUser, jsonBody, TENANT_ID } from "../_gate";

/**
 * Book a visit for a lead. The route check runs again on the write: a time the
 * machine cannot make is a 409 carrying the full check (factors and
 * alternatives) unless `overrideReason` is given.
 */
export async function POST(req: NextRequest) {
  const user = await crmUser();
  if (user instanceof NextResponse) return user;
  const r = await createBooking({ tenantId: TENANT_ID, userId: user }, await jsonBody(req), { tenantId: TENANT_ID, actor: "user" });
  if ("error" in r) return NextResponse.json({ error: r.error, check: r.check }, { status: r.status });
  revalidatePath("/tasks");
  revalidatePath("/leads/[id]", "page");
  return NextResponse.json(r, { status: 201 });
}
