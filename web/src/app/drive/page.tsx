import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const queue = await getDriveQueue(1, 25);

  return <DriveScreen initialQueue={queue} />;
}
