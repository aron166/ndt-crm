import type { ReactNode } from "react";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import { getActor } from "@/lib/actor";
import { countPendingForReviewer } from "@/lib/content/queries";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // getActor and countPendingForReviewer are request-cached: the app layout already asked for the
  // nav badge, so this adds no query. Layouts persist across client navigation; router.refresh()
  // (after an executed action) re-renders them and updates the badge.
  const { userId } = await getActor(1);
  const pending = userId == null ? 0 : await countPendingForReviewer(1, userId);
  return (
    <>
      {children}
      <AssistantLauncher userId={userId} pending={pending} />
    </>
  );
}
