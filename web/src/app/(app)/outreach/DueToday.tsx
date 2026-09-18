"use client";

import { useState } from "react";
import { getDueTouches, markDraftSentManually, type DueTouch } from "@/app/actions/outreach-campaigns";
import { canMarkSent } from "@/lib/outreach/campaign";
import type { DraftStatus } from "@/lib/outreach/drafts";

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
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <button
          onClick={() => setOpen(true)}
          disabled={!!disabledReason}
          title={disabledReason ?? undefined}
          style={{
            fontSize: 13, fontWeight: 500, color: "var(--mint)", background: "var(--mint-soft)",
            border: "1px solid oklch(0.80 0.13 165 / 0.35)", borderRadius: 8, padding: "6px 12px",
            cursor: disabledReason ? "default" : "pointer", opacity: disabledReason ? 0.5 : 1,
          }}
        >
          Kézzel elküldve
        </button>
        {disabledReason && <span style={{ fontSize: 12, color: "var(--amber)" }}>{disabledReason}</span>}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <input
        className="input-ds"
        value={threadId}
        onChange={(e) => setThreadId(e.target.value)}
        placeholder="Gmail szál azonosító (nem kötelező)"
        disabled={pending}
        style={{ fontSize: 13, color: "var(--fg)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "6px 10px" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={pending}
          style={{
            fontSize: 13, fontWeight: 500, color: "var(--mint)", background: "var(--mint-soft)",
            border: "1px solid oklch(0.80 0.13 165 / 0.35)", borderRadius: 8, padding: "6px 12px",
            cursor: pending ? "default" : "pointer", opacity: pending ? 0.5 : 1,
          }}
        >
          Rögzítés
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={pending}
          style={{
            fontSize: 13, color: "var(--fg-soft)", background: "var(--bg-raised)",
            border: "1px solid var(--line-soft)", borderRadius: 8, padding: "6px 12px", cursor: "pointer",
          }}
        >
          Mégse
        </button>
      </div>
      {error && <div style={{ fontSize: 13, color: "var(--coral)" }}>{error}</div>}
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
    <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>Ma esedékes</h2>
      {touches.length === 0 ? (
        <div style={{ fontSize: 14, color: "var(--fg-faint)" }}>Nincs ma esedékes érintés.</div>
      ) : (
        [...groups.entries()].map(([key, rows]) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-mute)" }}>
              {key === "none" ? "Nincs kiválasztva" : senderName.get(Number(key)) ?? "Nincs kiválasztva"}
            </div>
            {rows.map((t) => {
              const overdue = new Date(t.dueAt) < new Date();
              return (
                <div
                  key={t.draftId}
                  style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
                    padding: "8px 0", borderTop: "1px solid var(--line-soft)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>
                      {t.companyName}
                      {t.personName && <span style={{ color: "var(--fg-faint)" }}> · {t.personName}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>
                      {t.step}. érintés · {t.subject}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--fg-mute)" }}>
                    {new Date(t.dueAt).toLocaleString("hu-HU")}
                  </span>
                  {overdue && (
                    <span
                      style={{
                        fontSize: 12, fontWeight: 500, color: "var(--coral)", padding: "2px 8px", borderRadius: 999,
                        border: "1px solid var(--coral)", background: "var(--bg-raised)",
                      }}
                    >
                      Lejárt
                    </span>
                  )}
                  {canMarkSent(t.status as DraftStatus) ? (
                    <MarkSentControl draftId={t.draftId} onSent={reload} disabledReason={t.templateBlockedReason} />
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--fg-mute)" }}>Jóváhagyásra vár</span>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
