import Link from "next/link";
import { listDrafts, getOutreachSettings } from "@/app/actions/email-drafts";
import { listSenders, getDueTouches } from "@/app/actions/outreach-campaigns";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "./outreach.module.css";
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
    <div className={s.stack}>
      <PageHeader
        title="Outreach piszkozatok"
        eyebrow="Kampányonként megírt emailek jóváhagyása és küldése"
        actions={
          <Link href="/outreach/campaigns" className={k.btn}>
            Kampány-áttekintés →
          </Link>
        }
      />
      <DueToday touches={touches} senders={senders} />
      <OutreachQueue initialDrafts={drafts} campaigns={campaigns} initialSettings={settings} senders={senders} />
    </div>
  );
}
