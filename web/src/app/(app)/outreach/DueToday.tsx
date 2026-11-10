"use client";

import { useState } from "react";
import { getDueTouches, markDraftSentManually, type DueTouch } from "@/app/actions/outreach-campaigns";
import { canMarkSent } from "@/lib/outreach/campaign";
import type { DraftStatus } from "@/lib/outreach/drafts";
import k from "@/components/astryx/page.module.css";
import s from "./outreach.module.css";

type Sender = { id: number; name: string };

/**
 * "Kézzel elküldve" — shared between the due-today list and the queue rows.
 * `disabledReason` (§6b): the draft's step template is not live, so the
 * server would refuse the send anyway — disable here and say why, instead of
 * letting the human hit the server's refusal.
 */
export function MarkSentControl({
  draftId, onSent, disabledReason,
}: { draftId: number; onSent: () => void; disabledReason?: string | null }) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className={s.stackXs}>
        <button
          onClick={() => setOpen(true)}
          disabled={!!disabledReason}
          title={disabledReason ?? undefined}
          className={k.btn}
        >
          Kézzel elküldve
        </button>
        {disabledReason && <span className={k.muted} style={{ color: "var(--amber)" }}>{disabledReason}</span>}
      </div>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    const res = await markDraftSentManually({ draftId, externalThreadId: threadId.trim() || undefined });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // The next touch's date shows on its own row ("Esedékes") after the reload.
    setOpen(false);
    onSent();
  }

  return (
    <div className={s.stackXs}>
      <input
        className={s.field}
        value={threadId}
        onChange={(e) => setThreadId(e.target.value)}
        placeholder="Gmail szál azonosító (nem kötelező)"
        disabled={pending}
      />
      <div className={s.btnRow}>
        <button
          onClick={submit}
          disabled={pending}
          className={`${k.btn} ${k.btnPrimary}`}
        >
          Rögzítés
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={pending}
          className={k.btn}
        >
          Mégse
        </button>
      </div>
      {error && <div className={k.muted} style={{ color: "var(--coral)" }}>{error}</div>}
    </div>
  );
}

export default function DueToday({ touches: initialTouches, senders }: { touches: DueTouch[]; senders: Sender[] }) {
  const [touches, setTouches] = useState(initialTouches);
  const senderName = new Map(senders.map((s) => [s.id, s.name]));

  async function reload() {
    setTouches(await getDueTouches());
  }

  const groups = new Map<string, DueTouch[]>();
  for (const t of touches) {
    const key = t.senderUserId != null ? String(t.senderUserId) : "none";
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  return (
    <div className={k.card}>
      <h2 className={k.h2}>Ma esedékes</h2>
      {touches.length === 0 ? (
        <div className={k.muted}>Nincs ma esedékes érintés.</div>
      ) : (
        [...groups.entries()].map(([key, rows]) => (
          <div key={key} className={k.group}>
            <div className={k.groupHead}>
              <h3 className={k.groupTitle}>
                {key === "none" ? "Nincs kiválasztva" : senderName.get(Number(key)) ?? "Nincs kiválasztva"}
              </h3>
            </div>
            {rows.map((t) => {
              const overdue = new Date(t.dueAt) < new Date();
              return (
                <div key={t.draftId} className={k.row} data-u={overdue ? "overdue" : "today"}>
                  <span className={k.bar} />
                  <div className={k.cell}>
                    <span className={k.name}>
                      {t.companyName}
                      {t.personName && <span className={k.muted}> · {t.personName}</span>}
                    </span>
                    <span className={k.muted}>
                      {t.step}. érintés · {t.subject}
                    </span>
                  </div>
                  <div className={k.cell}>
                    {overdue && <span className={`${k.strong} ${s.late}`}>Lejárt</span>}
                    {!canMarkSent(t.status as DraftStatus) && <span className={k.muted}>Jóváhagyásra vár</span>}
                  </div>
                  <span className={`${k.muted} ${k.num}`}>
                    {new Date(t.dueAt).toLocaleString("hu-HU")}
                  </span>
                  <div className={k.cellEnd}>
                    {canMarkSent(t.status as DraftStatus) && (
                      <MarkSentControl draftId={t.draftId} onSent={reload} disabledReason={t.templateBlockedReason} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
