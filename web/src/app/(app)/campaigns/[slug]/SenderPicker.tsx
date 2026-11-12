"use client";
// Feladó: which user's name and phone the campaign's e-mails carry. Same action as the old
// /marketing/campaigns/<id> picker (setCampaignOutreach); the profile itself lives in /settings/profile.
// Hungarian copy is PROPOSAL until Áron approves it.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setCampaignOutreach } from "@/app/actions/campaigns";
import k from "@/components/astryx/page.module.css";
import s from "../campaigns.module.css";

export function SenderPicker({ campaignId, senderUserId, senders, phone }: {
  campaignId: number; senderUserId: number | null; senders: { id: number; name: string }[]; phone: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function pick(v: string) {
    setError(null);
    start(async () => {
      const res = await setCampaignOutreach(campaignId, { senderUserId: v ? Number(v) : null });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }
  return (
    <div>
      <label className={s.field}>
        <span>Feladó</span>
        <select className={s.input} value={senderUserId ?? ""} onChange={(e) => pick(e.target.value)} disabled={pending} style={{ maxWidth: 320 }}>
          <option value="">Nincs még feladó</option>
          {senders.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      {senderUserId != null && !phone && (
        <p className={s.flag}>A kiválasztott feladónak nincs telefonszáma, ezért a telefonszámos mező kitöltetlen marad. Ő a <Link href="/settings/profile" className={k.link}>Feladó profil</Link> oldalon adhatja meg.</p>
      )}
      {senderUserId == null && <p className={k.muted}>Feladó nélkül a feladó neve és telefonszáma kitöltetlen. A saját adataid a <Link href="/settings/profile" className={k.link}>Feladó profil</Link> oldalon adhatod meg.</p>}
      {error && <p className={k.error} role="alert">{error}</p>}
    </div>
  );
}
