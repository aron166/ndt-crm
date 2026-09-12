import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActor } from "@/lib/actor";
import { getDriveQueue } from "@/lib/leads/drive";
import { DriveScreen } from "./DriveScreen";

// /drive — in-car, single-screen lead caller. Deliberately OUTSIDE the
// (app) route group: no sidebar, no AppShell, own auth check (same pattern
// as (app)/layout.tsx, just without the shell).

export const dynamic = "force-dynamic";

export default async function DrivePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // getUser() only proves a Supabase session — logLeadCall additionally
  // requires a CRM users row (userLeadCtx), so the read gate should match.
  const { userId } = await getActor(1);
  if (userId == null) redirect("/login");

  const queue = await getDriveQueue(1, 25);

  return <DriveScreen initialQueue={queue} />;
}
