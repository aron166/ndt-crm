import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { db } from "@/lib/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const overdueCount = await db.task.count({
    where: {
      tenantId: 1,
      status: { in: ["created", "not_started", "in_progress"] },
      dueDate: { lt: new Date(new Date().toDateString()) },
      parentTaskId: null,
    },
  });

  return (
    <AppShell email={user.email ?? ""} overdueCount={overdueCount}>
      {children}
    </AppShell>
  );
}
