import { NextResponse } from "next/server";
import { loadMachines } from "@/lib/booking/route-service";
import { crmUser, TENANT_ID } from "../_gate";

/** The tenant's bookable machines with their base. */
export async function GET() {
  const user = await crmUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ machines: await loadMachines(TENANT_ID) });
}
