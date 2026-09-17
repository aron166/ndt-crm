import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { db } from "@/lib/db";
import { serializeDates } from "@/lib/serialize";
import { getActor } from "@/lib/actor";
import { countPendingForReviewer } from "@/lib/content/queries";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { userId } = await getActor(1);

  const [overdueCount, defaultPipeline, marketingReviewCount] = await Promise.all([
    db.task.count({
      where: {
        tenantId: 1,
        status: { in: ["created", "not_started", "in_progress"] },
        dueDate: { lt: new Date(new Date().toDateString()) },
        parentTaskId: null,
      },
    }),
    db.pipeline.findFirst({
      where: { tenantId: 1, isArchived: false },
      include: { stages: { orderBy: { position: "asc" } }, customFields: { orderBy: { position: "asc" } } },
      orderBy: { position: "asc" },
    }),
    userId == null ? Promise.resolve(0) : countPendingForReviewer(1, userId),
  ]);

  return (
    <AppShell
      email={user.email ?? ""}
      overdueCount={overdueCount}
      marketingReviewCount={marketingReviewCount}
      defaultPipeline={defaultPipeline ? serializeDates(defaultPipeline) : null}
    >
      {children}
    </AppShell>
  );
}
