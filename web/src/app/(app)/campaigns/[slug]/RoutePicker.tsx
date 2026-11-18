"use client";
// Küldési út: how the campaign's e-mails leave (Resend, the Workspace mailbox, or a CSV export). Saves through
// updateCampaignAction; a change sends a running campaign back to approval. The mailbox prop carries no password.
// Hungarian copy is PROPOSAL until Áron approves it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCampaignAction } from "@/app/actions/campaign-hub";
import k from "@/components/astryx/page.module.css";
import { RESEND_PROSPECT_REFUSAL, ROUTE_LABELS, SEND_ROUTES, type SendRoute } from "@/lib/campaigns/send-route";
import s from "../campaigns.module.css";

export function RoutePicker({ slug, route, prospectEmail, mailbox, status }: {
  slug: string; route: SendRoute; prospectEmail: boolean; status: string;
  mailbox: { on: boolean; user: string | null; dailyCap: number | null };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function pick(v: string) {
    setError(null);
    start(async () => {
      const res = await updateCampaignAction(slug, { send_route: v as SendRoute });
      if (res && "error" in res) setError(res.error);
      else router.refresh();
    });
  }
  return (
    <div>
      <label className={s.field}>
        <span>Küldési út</span>
        <select className={s.input} value={route} onChange={(e) => pick(e.target.value)} disabled={pending} style={{ maxWidth: 320 }}>
          {SEND_ROUTES.map((r) => <option key={r} value={r}>{ROUTE_LABELS[r]}</option>)}
        </select>
      </label>
      {route === "resend" && (prospectEmail
        ? <p className={s.flag}>{RESEND_PROSPECT_REFUSAL}</p>
        : <p className={k.muted}>Rendszerlevél-út: leadeknek és ügyfeleknek, nem hideg megkeresésre.</p>)}
      {route === "mailbox" && (mailbox.on
        ? <p className={k.muted}>A levelek a {mailbox.user} postafiókból mennek, napi legfeljebb {mailbox.dailyCap}, egyenként 1-3 perc szünettel, csak szöveges formában.</p>
        : <p className={s.flag}>A postafiók nincs beállítva (CAMPAIGN_SMTP_HOST, CAMPAIGN_SMTP_USER, CAMPAIGN_SMTP_PASS): ezen az úton most nem menne ki semmi.</p>)}
      {route === "export" && <p className={k.muted}>Ezt a kampányt a CRM nem küldi: töltsd le a CSV-t, és a hidegküldő eszköz viszi tovább.</p>}
      {status !== "draft" && <p className={k.muted}>Az út váltása után a kampány újra jóváhagyásra vár.</p>}
      {error && <p className={k.error} role="alert">{error}</p>}
    </div>
  );
}
