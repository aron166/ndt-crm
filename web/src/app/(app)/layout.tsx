import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { db } from "@/lib/db";
import { serializeDates } from "@/lib/serialize";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
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
  // A Supabase session is not a CRM user: signups are open, and `users` is the
  // allow-list. Without a users row, nothing inside the app renders (Vanda, #100).
  if (userId == null) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <p style={{ maxWidth: 420, fontSize: 16, color: "var(--fg-mute)" }}>{NOT_A_CRM_USER}</p>
      </main>
    );
  }

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
    countPendingForReviewer(1, userId),
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
