"use client";

import { displayScriptLabel, displayScriptText } from "@/lib/leads/placeholder";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { logLeadCall } from "@/app/actions/leads";
import { correctCallOutcome } from "@/app/actions/calls";
import type { BookingConflictInfo } from "@/lib/leads/service";
import { CALL_OUTCOMES, CALL_TYPES, type CallOutcomeKey, isLostCallOutcome, LOST_REASON_MAX, TECHNOLOGY_WORD_MAX } from "@/lib/leads/outcomes";
import { FormField } from "@/components/ui/FormField";
import { localInputToIso } from "./[id]/booking/booking-view";
import type { ScriptVariant } from "@/lib/leads/scripts";

// "Hívás eredménye" — the core lead interaction. Validation (note required,
// callback needs date+hour, meeting needs who) is enforced SERVER-side in
// lib/leads/service.ts; the `required` attributes here are just UX.


export function CallOutcomeModal({
  open, onClose, leadId, title, stageDescription, onLogged, scriptVariants = [], correctsInteractionId = null, initialOutcome, initialNote, hideMeetingBooked = false,
}: {
  open: boolean;
  onClose: () => void;
  leadId: number;
  /**
   * Set when this modal was opened to CORRECT an auto-derived outcome. The log
   * then goes through correctCallOutcome, which links the new interaction back
   * at the one it replaces — that link is what makes the agreement rate between
   * parsed and corrected outcomes measurable. Null = an ordinary call log.
   */
  correctsInteractionId?: number | null;
  /** Pre-selects this outcome each time the modal opens (default no_answer). */
  initialOutcome?: CallOutcomeKey;
  /** Pre-fills the note each time the modal opens (the lead page's calling mode). */
  initialNote?: string;
  /** The lead page books through its own drawer, so the outcome is not offered there. */
  hideMeetingBooked?: boolean;
  title?: string | null;
  stageDescription?: string | null;
  onLogged?: () => void;
  scriptVariants?: ScriptVariant[];
}) {
  const [outcome, setOutcome] = useState<string>("no_answer");
  const [note, setNote] = useState("");
  // Pre-select on the closed -> open edge (adjust state during render, no effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open && initialOutcome) setOutcome(initialOutcome); if (open && initialNote) setNote(initialNote); }
  const [callbackAt, setCallbackAt] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [technologyWord, setTechnologyWord] = useState("");
  const [callType, setCallType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedConflicts, setSavedConflicts] = useState<BookingConflictInfo[] | null>(null);
  // A/B: deterministic per-lead assignment (leadId % length), not random or
  // "always A" — every variant needs data, and a re-render must not switch
  // the script mid-call. Empty ("Nincs szkript") when the tenant has none.
  const defaultScriptKey = scriptVariants[leadId % scriptVariants.length]?.key ?? "";
  const [scriptKey, setScriptKey] = useState(defaultScriptKey);
  const script = scriptVariants.find((v) => v.key === scriptKey) ?? null;

  function reset() {
    setOutcome("no_answer"); setNote(""); setCallbackAt(""); setLostReason(""); setError(null);
    setSavedConflicts(null);
    setScriptKey(defaultScriptKey); setTechnologyWord(""); setCallType("");
  }
  // The call is already saved while the conflict notice shows — closing then
  // must still refresh the parent, same as "Rendben".
  function handleClose() { const saved = savedConflicts !== null; reset(); onClose(); if (saved) onLogged?.(); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        outcome, note,
        // datetime-local is Budapest wall-clock time, whatever zone the browser is in.
        callbackAt: outcome === "callback_requested" && callbackAt ? localInputToIso(callbackAt) : null,
        // Booking happens only in the lead page drawer.
        demoWith: null, bookingAt: null, bookingKind: null,
        lostReason: isLostCallOutcome(outcome) ? lostReason : null,
        scriptVariant: scriptKey || undefined,
        technologyWord: technologyWord.trim() || undefined,
        callType: callType || null,
      };
      const res = correctsInteractionId
        ? await correctCallOutcome(correctsInteractionId, leadId, payload)
        : await logLeadCall(leadId, payload);
      if ("error" in res) { setError(res.error); return; }
      if (res.bookingConflicts?.length > 0) { setSavedConflicts(res.bookingConflicts); return; }
      reset(); onClose(); onLogged?.();
    });
  }

  function acknowledgeConflicts() {
    reset(); onClose(); onLogged?.();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hívás eredménye</DialogTitle>
          {title && <p className="text-sm" style={{ color: "var(--ui-text-muted)" }}>{title}</p>}
        </DialogHeader>
        {stageDescription && (
          <div style={{ fontSize: 12, color: "var(--ui-text)", whiteSpace: "pre-wrap", background: "var(--ui-page)", border: "1px solid var(--ui-border)", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5, maxHeight: 180, overflowY: "auto" }}>
            {displayScriptText(stageDescription)}
          </div>
        )}
        {scriptVariants.length > 0 && (
          <FormField label="Szkript">
            <select className="input-ds" value={scriptKey} onChange={(e) => setScriptKey(e.target.value)}>
              <option value="">Nincs szkript</option>
              {scriptVariants.map((v) => <option key={v.key} value={v.key}>{displayScriptLabel(v.label)}</option>)}
            </select>
            {script && (script.body || script.liveMissing) && (
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--ui-text)", whiteSpace: "pre-wrap", background: "var(--ui-page)", border: "1px solid var(--ui-border)", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5, maxHeight: 220, overflowY: "auto" }}>
                {script.liveMissing ? "Nincs élő változat: a szkript még jóváhagyásra vár." : displayScriptText(script.body)}
              </div>
            )}
          </FormField>
        )}
        <FormField label="Ügyfél szava a technológiára" hint="Amit az ügyfél mondott, szó szerint. Opcionális.">
          <Input
            value={technologyWord}
            onChange={(e) => setTechnologyWord(e.target.value)}
            maxLength={TECHNOLOGY_WORD_MAX}
            placeholder="pl. anyagvizsgálat"
          />
        </FormField>
        {savedConflicts ? (
          <div style={{ background: "var(--ui-warning-surface)", color: "var(--ui-warning-text)", fontSize: 13, padding: "8px 10px", borderRadius: 6 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Mentve: de ütközik a naptárban:</p>
            {savedConflicts.map((c) => (
              <p key={c.taskId} style={{ margin: 0 }}>
                {c.title} ({new Date(c.startsAt).toLocaleString("hu-HU")}):{" "}
                {c.movable === "existing"
                  ? "a meglévő foglalás az alacsonyabb prioritású, azt lehet áthelyezni."
                  : "ez az új foglalás az alacsonyabb prioritású, ezt lehet áthelyezni."}
              </p>
            ))}
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Eredmény" required>
            <select className="input-ds" value={outcome} onChange={(e) => setOutcome(e.target.value)} autoFocus>
              {CALL_OUTCOMES.filter((o) => !(hideMeetingBooked && o.key === "meeting_booked")).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </FormField>

          {/* PROPOSAL copy */}
          <FormField label="Hívás típusa">
            <select aria-label="Hívás típusa" className="input-ds" value={callType} onChange={(e) => setCallType(e.target.value)}>
              <option value="">nincs megadva</option>
              {CALL_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </FormField>

          {outcome === "callback_requested" && (
            <FormField label="Visszahívás időpontja (dátum + óra)" required>
              <Input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} required />
            </FormField>
          )}

          {outcome === "meeting_booked" && (
            // PROPOSAL copy
            <p className="text-sm"><Link href={`/leads/${leadId}?book=1`}>Book the time on the lead page</Link></p>
          )}

          {isLostCallOutcome(outcome) && (
            <FormField label="Miért veszett el? (kötelező)" required>
              <Input
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                required
                minLength={3}
                maxLength={LOST_REASON_MAX}
                placeholder="pl. Van saját szkennerük · Nincs betonszerkezetük · Ár túl magas"
              />
            </FormField>
          )}

          <FormField label="Megjegyzés" required>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} required
              placeholder="Mi hangzott el? Mi a következő lépés?" />
          </FormField>

          {error && <p className="text-sm" style={{ color: "var(--ui-danger-text)" }}>{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={pending}>Mégse</Button>
            <Button type="submit" disabled={pending || outcome === "meeting_booked"}>
              {pending ? "Mentés…" : "Rögzítés"}
            </Button>
          </DialogFooter>
        </form>
        )}
        {savedConflicts && (
          <DialogFooter>
            <Button type="button" onClick={acknowledgeConflicts}>
              Rendben
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
