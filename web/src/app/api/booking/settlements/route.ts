import { NextRequest, NextResponse } from "next/server";
import { searchSettlements } from "@/lib/booking/route-service";
import { crmUser } from "../_gate";

/** Type-ahead for the job site: `?q=Sop` (name prefix) or `?q=9400` (postcode). */
export async function GET(req: NextRequest) {
  const user = await crmUser();
  if (user instanceof NextResponse) return user;
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  return NextResponse.json({ settlements: await searchSettlements(q) });
}
