"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Phone, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import c from "./calls.module.css";
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
    <div className={`mount ${c.wrap}`}>
      <PageHeader
        eyebrow="Vezetett hívókör · egy érintés = naplózott hívás"
        title="Hívás mód"
        filters={
          <>
            <div className={k.seg}>
              {(["guided", "list"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`${k.segItem} ${c.segBtn} ${mode === m ? k.segItemOn : ""}`}
                >
                  {m === "guided" ? "Vezetett" : "Lista"}
                </button>
              ))}
            </div>
            <select
              value={viewId ?? ""}
              onChange={(e) => changeSegment(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingQueue || submitting}
              className={c.select}
              aria-label="Hívandó-sor" /* PROPOSAL copy */
            >
              <option value="">Alapértelmezett hívandó-sor</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>Szegmens: {s.name}</option>
              ))}
            </select>
          </>
        }
      />

      {/* Progress + session tally */}
      <div className={c.progress}>
        <span className={`${k.muted} ${k.num}`}>
          {queue.length === 0 ? "0 / 0" : `${Math.min(index + 1, queue.length)} / ${queue.length}`}
        </span>
        <div className={c.track}>
          <div className={c.fill} style={{ width: `${queue.length ? (index / queue.length) * 100 : 0}%` }} />
        </div>
        {totalDone > 0 && <span className={c.tally}>{totalDone} ma</span>}
      </div>

      {loadingQueue ? (
        <Empty>Betöltés…</Empty>
      ) : queue.length === 0 ? (
        <Empty>Nincs hívandó cég ebben a sorban.</Empty>
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
        <Empty>Nincs hívandó cég ebben a sorban.</Empty>
      ) : (
        <div className={`${k.card} ${c.big}`}>
          {/* Company head */}
          <div className={c.head}>
            <div style={{ minWidth: 0 }}>
              <h2 className={c.company}>{current.name}</h2>
              <div className={k.meta} style={{ marginTop: 8 }}>
                <PipelineStatusBadge status={current.pipelineStatus} />
                <span className={k.muted}>{[current.city, current.county].filter(Boolean).join(", ") || "-"}</span>
                {current.website && (
                  <a href={normalizeUrl(current.website)} target="_blank" rel="noreferrer" className={k.link}>
                    {current.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
            <div className={c.side}>
              <span className={k.muted}>Utolsó: {formatRelativeTime(current.lastInteractionDate)}</span>
              <Link href={`/companies/${current.id}`} className={k.link}>
                Megnyitás →
              </Link>
            </div>
          </div>

          {/* Contact + click-to-call */}
          <div className={c.block}>
            {activeContact ? (
              <>
                {/* When the company has >1 active contact, let Péter pick who to call. */}
                {current.contacts.length > 1 && (
                  <div className={c.chips}>
                    {current.contacts.map((ct) => {
                      const sel = ct.personId === activeContact.personId;
                      return (
                        <button
                          key={ct.personId}
                          onClick={() => setSelectedPersonId(ct.personId)}
                          aria-pressed={sel}
                          className={`${c.chip} ${sel ? c.chipOn : ""}`}
                        >
                          {ct.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div>
                  <div className={c.contactName}>{activeContact.name}</div>
                  <div className={k.muted}>
                    {activeContact.role || "-"}
                    {activeContact.email && <> · {activeContact.email}</>}
                  </div>
                </div>
                {activeContact.phone ? (
                  <a href={`tel:${activeContact.phone.replace(/\s+/g, "")}`} className={c.phone}>
                    <Phone size={24} aria-hidden="true" /> {activeContact.phone}
                  </a>
                ) : (
                  <span className={k.muted}>Nincs telefonszám</span>
                )}
                {/* Trigger the phone (Make → Tasker) + recording. The tel: link above
                    stays as the manual fallback. */}
                {callId ? (
                  <div className={c.live}>
                    <span className={c.dot} />
                    Hívás folyamatban: válassz kimenetelt a befejezéshez
                  </div>
                ) : (
                  <button
                    onClick={beginCall}
                    disabled={calling || !activeContact.phone}
                    className={`${k.btn} ${k.btnPrimary}`}
                    style={{ alignSelf: "flex-start", minHeight: 48 }}
                  >
                    {calling ? "Indítás…" : (<><Phone size={16} aria-hidden="true" /> Hívás indítása</>)}
                  </button>
                )}
              </>
            ) : (
              <div className={k.muted}>
                Nincs rögzített kapcsolattartó,{" "}
                <Link href={`/companies/${current.id}`} className={k.link}>adj hozzá egyet</Link>
              </div>
            )}
          </div>

          {/* Company intel */}
          {current.notes && <div className={`${c.block} ${c.intel}`}>{current.notes}</div>}

          {/* History */}
          {current.history.length > 0 && (
            <div className={c.block}>
              <div className={c.label}>Előzmény</div>
              {current.history.map((h) => (
                <div key={h.id} className={c.hist}>
                  <span className={c.histWhen}>{formatRelativeTime(h.occurredAt)}</span>
                  <span className={k.muted} style={{ minWidth: 0 }}>
                    <span className={k.strong}>{INTERACTION_LABEL[h.type ?? "note"] ?? h.type}</span>
                    {h.notes && <>: {h.notes}</>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Note + follow-up */}
          <div className={c.block}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jegyzet a hívásról (opcionális)…"
              rows={2}
              className={c.field}
            />
            <label className={c.inline}>
              Visszahívás:
              <input type="date" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} className={c.date} />
              {followupDate && <span>→ feladat készül</span>}
            </label>
          </div>

          {error && <div className={c.err}>{error}</div>}

          {/* Outcome buttons */}
          <div className={c.block}>
            <div className={c.outcomes}>
              {CALL_OUTCOMES.map((o, i) => (
                <button
                  key={o.key}
                  onClick={() => submit(o.key)}
                  disabled={submitting}
                  className={`${k.btn} ${c.outcome}`}
                  style={{ color: o.tone, borderColor: o.tone }}
                >
                  <span className={c.key}>{i + 1}</span>
                  {o.label}
                </button>
              ))}
            </div>
            <div className={c.foot}>
              <span className={k.muted}>
                Gyorsbillentyű: 1–{CALL_OUTCOMES.length} kimenetel · S = kihagyás
              </span>
              <button onClick={advance} disabled={submitting} className={c.skip}>
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
    <div>
      {queue.map((q, i) => {
        const ct = q.contacts[0];
        return (
          <div
            key={q.id}
            role="button"
            tabIndex={0}
            onClick={() => onPick(i)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                if (e.key === " ") e.preventDefault();
                onPick(i);
              }
            }}
            className={`${k.row} ${c.listRow}`}
            data-active={i === activeIndex}
          >
            <span className={`${k.bar} ${c.listBar}`} />
            <div className={k.cell}>
              <span className={k.nameLine}>
                <span className={k.name}>{q.name}</span>
                <PipelineStatusBadge status={q.pipelineStatus} />
              </span>
            </div>
            <div className={k.cell}>
              <span className={k.strong}>{ct ? ct.name : "Nincs kapcsolattartó"}</span>
              <span className={k.muted}>
                {ct?.role || "-"}
                {q.contacts.length > 1 && <> · +{q.contacts.length - 1}</>}
              </span>
            </div>
            <span className={k.muted}>{formatRelativeTime(q.lastInteractionDate)}</span>
            <div className={k.cellEnd}>
              {ct?.phone && (
                <a
                  href={`tel:${ct.phone.replace(/\s+/g, "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className={`${k.btn} ${c.phoneBtn}`}
                  aria-label={`Hívás: ${ct.phone}`}
                  title={ct.phone}
                >
                  <Phone size={16} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className={k.empty}>{children}</div>;
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
    <div className={`${k.card} ${c.center}`}>
      <CheckCircle2 size={32} aria-hidden="true" style={{ color: "var(--ui-success-text)" }} />
      <h2 className={k.h2}>Hívókör kész</h2>
      <p className={k.muted} style={{ margin: 0 }}>{totalDone} hívás naplózva ebben a körben.</p>
      {totalDone > 0 && (
        <div className={c.chips} style={{ justifyContent: "center" }}>
          {CALL_OUTCOMES.filter((o) => tally[o.key]).map((o) => (
            <span key={o.key} className={c.pill} style={{ color: o.tone, border: `1px solid ${o.tone}` }}>
              {o.label}: <strong>{tally[o.key]}</strong>
            </span>
          ))}
        </div>
      )}
      <button onClick={onRestart} className={`${k.btn} ${k.btnPrimary}`} style={{ marginTop: 8 }}>
        Új kör betöltése
      </button>
    </div>
  );
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}
