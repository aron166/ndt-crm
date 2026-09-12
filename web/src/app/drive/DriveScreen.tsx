"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logLeadCall } from "@/app/actions/leads";
import { CALL_OUTCOMES, CALL_OUTCOMES_NEEDING_DETAIL, isLostCallOutcome, LOST_REASON_MAX, type CallOutcomeKey } from "@/lib/leads/outcomes";
import { TIER_COLOR, TIER_LABEL, isTier } from "@/lib/leads/tier";
import type { DriveLead } from "@/lib/leads/drive";

// /drive — one column, thumb-reachable, phone-at-arm's-length in a car.
// Outcome rules (which extra field, min lengths) live server-side in
// lib/leads/outcomes.ts; this screen only reveals the right field and relays
// whatever error the server sends back.

const NEEDS_FIELD = new Set<CallOutcomeKey>(CALL_OUTCOMES_NEEDING_DETAIL);
const OUTCOME_TONE: Partial<Record<CallOutcomeKey, "red" | "green">> = {
  not_interested: "red",
  disqualified: "red",
  meeting_booked: "green",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 16,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 8, color: "var(--fg)", outline: "none",
};

function outcomeBtnStyle(tone: "red" | "green" | undefined): React.CSSProperties {
  return {
    width: "100%", minHeight: 56, padding: "10px 16px",
    fontSize: 16, fontWeight: 600, borderRadius: 10,
    border: "1px solid " + (tone === "red" ? "var(--coral)" : tone === "green" ? "var(--mint)" : "var(--line)"),
    background: tone === "red" ? "var(--coral-soft)" : tone === "green" ? "var(--mint-soft)" : "var(--bg-1)",
    color: tone === "red" ? "var(--coral)" : tone === "green" ? "var(--mint)" : "var(--fg)",
    cursor: "pointer",
  };
}

export function DriveScreen({ initialQueue }: { initialQueue: DriveLead[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  // Which lead ids are done (skipped or saved) this session — an index would
  // get scrambled every time a fresh queue reshuffles a `no_answer` lead back
  // toward the top, replaying the same lead forever and undoing every skip.
  const [done, setDone] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcomeKey | null>(null);
  const [callbackAt, setCallbackAt] = useState("");
  const [demoWith, setDemoWith] = useState<"aron" | "peter">("aron");
  const [lostReason, setLostReason] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  // A fresh queue arrives (router.refresh() re-runs the server component and
  // hands us a new array) — keep it, but never reset `done`: that's what was
  // undoing every skip and re-serving `no_answer` leads on loop.
  useEffect(() => {
    setQueue(initialQueue);
  }, [initialQueue]);

  const lead = queue.find((l) => !done.has(l.id));
  // Count what is actually left in THIS queue — `done` can hold ids a refresh
  // has already dropped from it.
  const remaining = queue.filter((l) => !done.has(l.id)).length;

  function resetFields() {
    setNote(""); setSelectedOutcome(null); setCallbackAt("");
    setDemoWith("aron"); setLostReason(""); setExpanded(false); setError(null);
  }

  function skip() {
    if (!lead) return;
    resetFields();
    setDone((d) => new Set(d).add(lead.id));
  }

  function submit(outcome: CallOutcomeKey) {
    if (!lead || submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await logLeadCall(lead.id, {
          outcome,
          note,
          callbackAt: outcome === "callback_requested" && callbackAt ? new Date(callbackAt).toISOString() : null,
          demoWith: outcome === "meeting_booked" ? demoWith : null,
          lostReason: isLostCallOutcome(outcome) ? lostReason : null,
        });
        if ("error" in res) { setError(res.error); return; }
        resetFields();
        setDone((d) => new Set(d).add(lead.id));
      } catch {
        setError("Mentés sikertelen — próbáld újra");
      } finally {
        submitting.current = false;
      }
    });
  }

  function tapOutcome(key: CallOutcomeKey) {
    setError(null);
    // Every outcome needs a non-empty note server-side (callOutcomeSchema) —
    // no_answer/wrong_number have no other field, so without a note typed
    // already they must still stop at the confirm step instead of submitting
    // an outcome that is guaranteed to fail.
    if (NEEDS_FIELD.has(key) || note.trim() === "") {
      setSelectedOutcome(key);
    } else {
      submit(key);
    }
  }

  if (!lead) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 24, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center" }}>
        <p style={{ fontSize: 16, color: "var(--fg-soft)" }}>Nincs több lead a sorban.</p>
        <button style={outcomeBtnStyle(undefined)} onClick={() => router.refresh()}>Frissítés</button>
      </div>
    );
  }

  const contextLines = [
    ...lead.apropo,
    lead.serviceInterest,
    lead.message,
  ].filter((v): v is string => !!v && v.trim().length > 0);

  const tierColor = lead.tier && isTier(lead.tier) ? TIER_COLOR[lead.tier] : "var(--fg-faint)";
  const tierLabel = lead.tier && isTier(lead.tier) ? TIER_LABEL[lead.tier] : lead.tier;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 32px", minHeight: "100dvh", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "var(--fg-mute)" }}>
        <span>{remaining} / {queue.length}</span>
        <button onClick={skip} disabled={pending} style={{ background: "none", border: "none", color: "var(--fg-mute)", fontSize: 13, padding: 4, cursor: "pointer" }}>
          Kihagyom
        </button>
      </div>

      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--fg)", margin: 0, lineHeight: 1.25 }}>{lead.companyName}</h1>
        {lead.personName && <div style={{ fontSize: 16, color: "var(--fg-soft)", marginTop: 2 }}>{lead.personName}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" }}>
          {lead.city && <span style={{ fontSize: 13, color: "var(--fg-mute)" }}>{lead.city}</span>}
          {lead.tier && (
            <span style={{ fontSize: 12, fontWeight: 600, color: tierColor, border: `1px solid ${tierColor}`, borderRadius: 999, padding: "2px 8px" }}>
              {tierLabel}
            </span>
          )}
          {lead.callbackAt && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--amber)", background: "var(--amber-soft)", borderRadius: 999, padding: "2px 8px" }}>
              Visszahívás esedékes
            </span>
          )}
        </div>
      </div>

      {lead.phone ? (
        <a
          href={`tel:${lead.phone.replace(/\s+/g, "")}`}
          style={{
            display: "block", width: "100%", textAlign: "center", boxSizing: "border-box",
            padding: "18px 16px", fontSize: 22, fontWeight: 700, borderRadius: 12,
            background: "linear-gradient(180deg, oklch(0.66 0.19 278), oklch(0.56 0.18 278))",
            color: "white", textDecoration: "none",
          }}
        >
          {lead.phone}
        </a>
      ) : (
        <div style={{ width: "100%", boxSizing: "border-box", textAlign: "center", padding: "18px 16px", fontSize: 18, fontWeight: 600, borderRadius: 12, background: "var(--bg-1)", color: "var(--fg-faint)", border: "1px solid var(--line-soft)" }}>
          Nincs telefonszám
        </div>
      )}

      {(contextLines.length > 0 || lead.lastNote) && (
        <div style={{ background: "var(--bg-1)", border: "1px solid var(--line-soft)", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "var(--fg-soft)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, ...(expanded ? {} : { maxHeight: 88, overflow: "hidden" }) }}>
            {contextLines.map((line, i) => <p key={i} style={{ margin: 0, lineHeight: 1.5 }}>{line}</p>)}
            {lead.lastNote && (
              <div>
                <div style={{ fontSize: 11, color: "var(--fg-faint)", marginBottom: 2 }}>Utolsó jegyzet</div>
                <p style={{ margin: 0, lineHeight: 1.5 }}>{lead.lastNote}</p>
              </div>
            )}
          </div>
          {(contextLines.length > 0 || lead.lastNote) && (
            <button onClick={() => setExpanded((e) => !e)} style={{ background: "none", border: "none", color: "var(--indigo)", fontSize: 12, padding: "6px 0 0", cursor: "pointer" }}>
              {expanded ? "kevesebb" : "több"}
            </button>
          )}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Jegyzet"
        rows={3}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />

      {error && <p style={{ margin: 0, fontSize: 14, color: "var(--coral)" }}>{error}</p>}

      {/* Once an outcome needs a detail, the other five buttons go away: in a
          car the screen must hold one decision at a time, not seven. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(selectedOutcome ? CALL_OUTCOMES.filter((o) => o.key === selectedOutcome) : CALL_OUTCOMES).map((o) => (
          <button key={o.key} disabled={pending} onClick={() => tapOutcome(o.key)} style={outcomeBtnStyle(OUTCOME_TONE[o.key])}>
            {o.label}
          </button>
        ))}
      </div>

      {selectedOutcome && (NEEDS_FIELD.has(selectedOutcome) || note.trim() === "") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {note.trim() === "" && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--coral)" }}>A jegyzet kötelező</p>
          )}
          {selectedOutcome === "callback_requested" && (
            <input type="datetime-local" style={inputStyle} value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} />
          )}
          {selectedOutcome === "meeting_booked" && (
            <div style={{ display: "flex", gap: 16, fontSize: 15, color: "var(--fg)" }}>
              {(["aron", "peter"] as const).map((w) => (
                <label key={w} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" name="demoWith" value={w} checked={demoWith === w} onChange={() => setDemoWith(w)} />
                  {w === "aron" ? "Áron" : "Péter"}
                </label>
              ))}
            </div>
          )}
          {(selectedOutcome === "not_interested" || selectedOutcome === "disqualified") && (
            <input
              style={inputStyle}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              maxLength={LOST_REASON_MAX}
              placeholder="Miért veszett el? (kötelező)"
            />
          )}
          <button disabled={pending || note.trim() === ""} onClick={() => submit(selectedOutcome)} style={outcomeBtnStyle("green")}>
            {pending ? "Mentés…" : "Mentés"}
          </button>
          <button
            disabled={pending}
            onClick={() => { setSelectedOutcome(null); setError(null); }}
            style={{ background: "none", border: "none", color: "var(--fg-mute)", fontSize: 14, padding: 8, cursor: "pointer" }}
          >
            Mégsem
          </button>
        </div>
      )}
    </div>
  );
}
