import { NextRequest, NextResponse } from "next/server";
import { leadSite } from "@/lib/booking/route-service";
import { crmUser, TENANT_ID } from "../../../_gate";

/** Prefill for the booking form: where this lead's job probably is, and how we know. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await crmUser();
  if (user instanceof NextResponse) return user;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Érvénytelen azonosító" }, { status: 400 });
  const site = await leadSite(TENANT_ID, id);
  if (!site) return NextResponse.json({ error: "Lead nem található" }, { status: 404 });
  return NextResponse.json(site);
}
