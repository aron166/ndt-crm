import Link from "next/link";
import { listDrafts, getOutreachSettings } from "@/app/actions/email-drafts";
import { listSenders, getDueTouches } from "@/app/actions/outreach-campaigns";
import OutreachQueue from "./OutreachQueue";
import DueToday from "./DueToday";

// The queue is live (status changes as drafts get approved/sent).
export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const [{ drafts, campaigns }, settings, senders, touches] = await Promise.all([
    listDrafts(),
    getOutreachSettings(),
    listSenders(),
    getDueTouches(),
  ]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Link href="/outreach/campaigns" style={{ fontSize: 14, color: "var(--indigo)" }}>
        Kampány-áttekintés →
      </Link>
      <DueToday touches={touches} senders={senders} />
      <OutreachQueue initialDrafts={drafts} campaigns={campaigns} initialSettings={settings} senders={senders} />
    </div>
  );
}
