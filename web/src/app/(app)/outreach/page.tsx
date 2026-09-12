import { listDrafts, getOutreachSettings } from "@/app/actions/email-drafts";
import OutreachQueue from "./OutreachQueue";

// The queue is live (status changes as drafts get approved/sent).
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const [{ drafts, campaigns }, settings] = await Promise.all([
    listDrafts(),
    getOutreachSettings(),
  ]);
  return <OutreachQueue initialDrafts={drafts} campaigns={campaigns} initialSettings={settings} />;
}
