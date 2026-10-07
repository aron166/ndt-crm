import type { ReactNode } from "react";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import { getActor } from "@/lib/actor";
import { countPendingForReviewer } from "@/lib/content/queries";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  // getActor is request-cached. The pending count is the nav badge's helper, called a second time
  // (it is not cached), so this layout adds one count query per marketing navigation.
  const { userId } = await getActor(1);
  const pending = userId == null ? 0 : await countPendingForReviewer(1, userId);
  return (
    <>
      {children}
      <AssistantLauncher userId={userId} pending={pending} />
    </>
  );
}
