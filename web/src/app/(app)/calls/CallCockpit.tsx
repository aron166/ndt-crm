"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { formatRelativeTime } from "@/lib/utils";
import { CALL_OUTCOMES } from "@/lib/outreach/queue";
import {
  getCallQueue,
  recordCall,
  startCall,
  type CallCard,
  type CallSegment,
} from "@/app/actions/outreach";

const INTERACTION_LABEL: Record<string, string> = {
  call: "Hívás", email: "Email", meeting: "Találkozó", site_visit: "Helyszíni", note: "Jegyzet",
};

export default function CallCockpit({
  initialQueue,
  segments,
}: {
  initialQueue: CallCard[];
  segments: CallSegment[];
}) {
  const [queue, setQueue] = useState<CallCard[]>(initialQueue);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"guided" | "list">("guided");
  const [notes, setNotes] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [callId, setCallId] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [calling, setCalling] = useState(false);

  const current = queue[index] ?? null;
  const done = !loadingQueue && index >= queue.length;
  const totalDone = Object.values(tally).reduce((a, b) => a + b, 0);
  // Which contact to call: the picked one, else the primary (contacts[0]).
  const activeContact =
    current?.contacts.find((c) => c.personId === selectedPersonId) ?? current?.contacts[0] ?? null;

  const resetCard = useCallback(() => {
    setNotes("");
    setFollowupDate("");
    setSelectedPersonId(null);
    setCallId(null);
    setCallStartedAt(null);
    setError(null);
  }, []);

  // Fire the call-started webhook (Make → Tasker dials + recording starts) and
  // flip the card into "in call" so the outcome buttons can log its duration.
  const beginCall = useCallback(async () => {
    if (!current || !activeContact || calling) return;
    setCalling(true);
    setError(null);
    try {
      const res = await startCall({
        companyId: current.id,
        personId: activeContact.personId,
        contactName: activeContact.name,
        phone: activeContact.phone,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setCallId(res.callId);
      setCallStartedAt(Date.now());
    } catch {
      setError("Hívás indítása sikertelen");
    } finally {
      setCalling(false);
    }
  }, [current, activeContact, calling]);

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    resetCard();
  }, [resetCard]);

  const submit = useCallback(
    async (outcomeKey: string) => {
      if (!current || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await recordCall({
          companyId: current.id,
          personId: activeContact?.personId ?? null,
          outcome: outcomeKey,
          notes,
          followupDate: followupDate || null,
          durationSec: callStartedAt ? Math.round((Date.now() - callStartedAt) / 1000) : null,
        });
        if ("error" in res) {
          setError(res.error);
          return;
        }
        setTally((t) => ({ ...t, [outcomeKey]: (t[outcomeKey] ?? 0) + 1 }));
        advance();
      } catch {
        setError("Hívás naplózása sikertelen");
      } finally {
        setSubmitting(false);
      }
    },
    [current, activeContact, submitting, notes, followupDate, callStartedAt, advance],
  );

  async function changeSegment(next: number | null) {
    setLoadingQueue(true);
    setViewId(next);
    setError(null);
    try {
      const q = await getCallQueue(next);
      setQueue(q);
      setIndex(0);
      resetCard();
      setTally({});
    } catch {
      setError("Sor betöltése sikertelen");
    } finally {
      setLoadingQueue(false);
    }
  }

  // Keyboard: 1–6 fire the outcome buttons, "s" skips. The whole point is to work
  // a list at speed without reaching for the mouse. Disabled while typing a note.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || submitting) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "textarea" || tag === "input" || tag === "select") return;
      if (e.key >= "1" && e.key <= String(CALL_OUTCOMES.length)) {
        e.preventDefault();
        submit(CALL_OUTCOMES[Number(e.key) - 1].key);
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        advance();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, submitting, submit, advance]);

  return (
    <div className="mount" style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)", margin: 0 }}>
            Hívás mód
          </h1>
          <p style={{ fontSize: 14, color: "var(--fg-faint)", marginTop: 3 }}>
            Vezetett hívókör · egy érintés = naplózott hívás
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", border: "1px solid var(--line-soft)", borderRadius: 8, overflow: "hidden" }}>
            {(["guided", "list"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  fontSize: 14, fontWeight: 500, padding: "7px 12px", cursor: "pointer", border: "none",
                  background: mode === m ? "var(--indigo-soft)" : "var(--bg-panel)",
                  color: mode === m ? "var(--indigo)" : "var(--fg-faint)",
                }}
              >
                {m === "guided" ? "Vezetett" : "Lista"}
              </button>
            ))}
          </div>
          <select
            value={viewId ?? ""}
            onChange={(e) => changeSegment(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingQueue || submitting}
            style={{
              fontSize: 14, color: "var(--fg-soft)", background: "var(--bg-panel)",
              border: "1px solid var(--line-soft)", borderRadius: 8, padding: "7px 10px",
            }}
          >
            <option value="">Alapértelmezett hívandó-sor</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>Szegmens: {s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Progress + session tally */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span className="font-mono-ndt" style={{ fontSize: 14, color: "var(--fg-mute)" }}>
          {queue.length === 0 ? "0 / 0" : `${Math.min(index + 1, queue.length)} / ${queue.length}`}
        </span>
        <div style={{ flex: 1, height: 5, background: "var(--bg-raised)", borderRadius: 4, overflow: "hidden", minWidth: 80 }}>
          <div style={{ height: "100%", width: `${queue.length ? (index / queue.length) * 100 : 0}%`, background: "var(--indigo)", transition: "width .2s" }} />
        </div>
        {totalDone > 0 && (
          <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--mint)", background: "var(--mint-soft)", padding: "2px 9px", borderRadius: 10 }}>
            {totalDone} ma
          </span>
        )}
      </div>

      {loadingQueue ? (
        <Empty>Betöltés…</Empty>
      ) : queue.length === 0 ? (
        <Empty>Nincs hívandó cég ebben a sorban. 🎉</Empty>
      ) : mode === "list" ? (
        <CallList
          queue={queue}
          activeIndex={index}
          onPick={(i) => {
            setIndex(i);
            resetCard();
            setMode("guided");
          }}
        />
      ) : done ? (
        <DoneCard tally={tally} totalDone={totalDone} onRestart={() => changeSegment(viewId)} />
      ) : !current ? (
        <Empty>Nincs hívandó cég ebben a sorban. 🎉</Empty>
      ) : (
        <div className="panel mount mount-1" style={{ padding: 0 }}>
          {/* Company head */}
          <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--line-soft)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--fg)", margin: 0, letterSpacing: "-0.01em" }}>
                    {current.name}
                  </h2>
                  <PipelineStatusBadge status={current.pipelineStatus} />
                </div>
                <div style={{ fontSize: 14, color: "var(--fg-faint)", marginTop: 4 }}>
                  {[current.city, current.county].filter(Boolean).join(", ") || "—"}
                  {current.website && (
                    <>
                      {" · "}
                      <a href={normalizeUrl(current.website)} target="_blank" rel="noreferrer" style={{ color: "var(--sky)" }}>
                        {current.website.replace(/^https?:\/\//, "")}
                      </a>
                    </>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>
                  Utolsó: {formatRelativeTime(current.lastInteractionDate)}
                </div>
                <Link href={`/companies/${current.id}`} style={{ fontSize: 12, color: "var(--indigo)" }}>
                  Megnyitás →
                </Link>
              </div>
            </div>
          </div>

          {/* Contact + click-to-call */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-soft)" }}>
            {activeContact ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* When the company has >1 active contact, let Péter pick who to call. */}
                {current.contacts.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {current.contacts.map((c) => {
                      const sel = c.personId === activeContact.personId;
                      return (
                        <button
                          key={c.personId}
                          onClick={() => setSelectedPersonId(c.personId)}
                          style={{
                            fontSize: 14, fontWeight: 500, padding: "4px 10px", borderRadius: 14, cursor: "pointer",
                            background: sel ? "var(--indigo-soft)" : "var(--bg-raised)",
                            color: sel ? "var(--indigo)" : "var(--fg-mute)",
                            border: `1px solid ${sel ? "var(--indigo-line)" : "var(--line-soft)"}`,
                          }}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{activeContact.name}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 1 }}>
                      {activeContact.role || "—"}
                      {activeContact.email && <> · {activeContact.email}</>}
                    </div>
                  </div>
                  {activeContact.phone ? (
                    <a
                      href={`tel:${activeContact.phone.replace(/\s+/g, "")}`}
                      className="font-mono-ndt"
                      style={{
                        fontSize: 16, fontWeight: 600, color: "var(--mint)",
                        background: "var(--mint-soft)", border: "1px solid oklch(0.80 0.13 165 / 0.35)",
                        padding: "8px 16px", borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap",
                      }}
                    >
                      📞 {activeContact.phone}
                    </a>
                  ) : (
                    <span style={{ fontSize: 14, color: "var(--fg-faint)" }}>Nincs telefonszám</span>
                  )}
                </div>
                {/* Trigger the phone (Make → Tasker) + recording. The tel: link above
                    stays as the manual fallback. */}
                {callId ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--mint)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint)" }} />
                    Hívás folyamatban — válassz kimenetelt a befejezéshez
                  </div>
                ) : (
                  <button
                    onClick={beginCall}
                    disabled={calling || !activeContact.phone}
                    style={{
                      alignSelf: "flex-start", fontSize: 14, fontWeight: 600, color: "var(--indigo)",
                      background: "var(--indigo-soft)", border: "1px solid var(--indigo-line)",
                      borderRadius: 8, padding: "8px 16px",
                      cursor: calling || !activeContact.phone ? "default" : "pointer",
                      opacity: calling || !activeContact.phone ? 0.5 : 1,
                    }}
                  >
                    {calling ? "Indítás…" : "📞 Hívás indítása"}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--fg-faint)" }}>
                Nincs rögzített kapcsolattartó —{" "}
                <Link href={`/companies/${current.id}`} style={{ color: "var(--indigo)" }}>adj hozzá egyet</Link>
              </div>
            )}
          </div>

          {/* Company intel */}
          {current.notes && (
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-soft)", fontSize: 14, color: "var(--fg-mute)", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>
              {current.notes}
            </div>
          )}

          {/* History */}
          {current.history.length > 0 && (
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-faint)", marginBottom: 8 }}>
                Előzmény
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {current.history.map((h) => (
                  <div key={h.id} style={{ display: "flex", gap: 8, fontSize: 14 }}>
                    <span className="font-mono-ndt" style={{ color: "var(--fg-faint)", flexShrink: 0, width: 64 }}>
                      {formatRelativeTime(h.occurredAt)}
                    </span>
                    <span style={{ color: "var(--fg-mute)", minWidth: 0 }}>
                      <span style={{ color: "var(--fg-soft)" }}>{INTERACTION_LABEL[h.type ?? "note"] ?? h.type}</span>
                      {h.notes && <> — {h.notes}</>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Note + follow-up */}
          <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jegyzet a hívásról (opcionális)…"
              rows={2}
              style={{
                width: "100%", fontSize: 14, color: "var(--fg)", background: "var(--bg-raised)",
                border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 10px", resize: "vertical",
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-mute)" }}>
              Visszahívás:
              <input
                type="date"
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
                style={{ fontSize: 14, color: "var(--fg-soft)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "5px 8px" }}
              />
              {followupDate && <span style={{ color: "var(--fg-faint)" }}>→ feladat készül</span>}
            </label>
          </div>

          {error && (
            <div style={{ padding: "0 20px 10px", fontSize: 14, color: "var(--coral)" }}>{error}</div>
          )}

          {/* Outcome buttons */}
          <div style={{ padding: "12px 20px 18px", borderTop: "1px solid var(--line-soft)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {CALL_OUTCOMES.map((o, i) => (
                <button
                  key={o.key}
                  onClick={() => submit(o.key)}
                  disabled={submitting}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 14, fontWeight: 500, color: o.tone,
                    background: "var(--bg-raised)", border: `1px solid ${o.tone}`,
                    borderRadius: 8, padding: "10px 8px", cursor: submitting ? "default" : "pointer",
                    opacity: submitting ? 0.5 : 1,
                  }}
                  className="tbl-row"
                >
                  <span className="font-mono-ndt" style={{ fontSize: 12, opacity: 0.6 }}>{i + 1}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>
                Gyorsbillentyű: 1–{CALL_OUTCOMES.length} kimenetel · S = kihagyás
              </span>
              <button
                onClick={advance}
                disabled={submitting}
                style={{ fontSize: 14, color: "var(--fg-faint)", background: "none", border: "none", cursor: "pointer" }}
              >
                Kihagyás →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CallList({
  queue,
  activeIndex,
  onPick,
}: {
  queue: CallCard[];
  activeIndex: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="panel mount mount-1" style={{ padding: 0, overflow: "hidden" }}>
      {queue.map((c, i) => {
        const ct = c.contacts[0];
        return (
          <div
            key={c.id}
            onClick={() => onPick(i)}
            className="tbl-row"
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", cursor: "pointer",
              borderTop: i === 0 ? "none" : "1px solid var(--line-soft)",
              background: i === activeIndex ? "var(--bg-raised)" : "transparent",
            }}
          >
            <PipelineStatusBadge status={c.pipelineStatus} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 1 }}>
                {ct ? ct.name : "Nincs kapcsolattartó"}
                {ct?.role && <> · {ct.role}</>}
                {c.contacts.length > 1 && <> · +{c.contacts.length - 1}</>}
              </div>
            </div>
            <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)", flexShrink: 0 }}>
              {formatRelativeTime(c.lastInteractionDate)}
            </span>
            {ct?.phone ? (
              <a
                href={`tel:${ct.phone.replace(/\s+/g, "")}`}
                onClick={(e) => e.stopPropagation()}
                className="font-mono-ndt"
                style={{
                  fontSize: 14, fontWeight: 600, color: "var(--mint)", background: "var(--mint-soft)",
                  border: "1px solid oklch(0.80 0.13 165 / 0.35)", padding: "5px 10px", borderRadius: 7,
                  textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                📞
              </a>
            ) : (
              <span style={{ width: 30, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: "48px 20px", textAlign: "center", fontSize: 14, color: "var(--fg-faint)" }}>
      {children}
    </div>
  );
}

function DoneCard({
  tally,
  totalDone,
  onRestart,
}: {
  tally: Record<string, number>;
  totalDone: number;
  onRestart: () => void;
}) {
  return (
    <div className="panel mount mount-1" style={{ padding: "32px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--fg)", margin: 0 }}>Hívókör kész</h2>
      <p style={{ fontSize: 14, color: "var(--fg-mute)", marginTop: 6 }}>
        {totalDone} hívás naplózva ebben a körben.
      </p>
      {totalDone > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {CALL_OUTCOMES.filter((o) => tally[o.key]).map((o) => (
            <span key={o.key} style={{ fontSize: 14, color: o.tone, background: "var(--bg-raised)", border: `1px solid ${o.tone}`, padding: "4px 10px", borderRadius: 16 }}>
              {o.label}: <strong>{tally[o.key]}</strong>
            </span>
          ))}
        </div>
      )}
      <button
        onClick={onRestart}
        style={{ marginTop: 22, fontSize: 14, fontWeight: 500, color: "var(--indigo)", background: "var(--indigo-soft)", border: "1px solid var(--indigo-line)", borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}
      >
        Új kör betöltése
      </button>
    </div>
  );
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}
