"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { logLeadCall } from "@/app/actions/leads";
import { proposeBookingSlots } from "@/app/actions/bookings";
import { CALL_OUTCOMES, isLostCallOutcome, LOST_REASON_MAX } from "@/lib/leads/outcomes";
import { BOOKING_KINDS, BOOKING_KIND_LABEL, type BookingKind } from "@/lib/booking/priority";
import { FormField } from "@/components/ui/FormField";
import type { ScriptVariant } from "@/lib/leads/scripts";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local wall-clock time.
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SLOT_REASON_LINE: Record<string, string> = {
  same_area: "arrafelé leszel aznap",
  free_day: "szabad nap",
  next_free: "legközelebbi szabad idő",
};

type SlotProposalsResult = Extract<Awaited<ReturnType<typeof proposeBookingSlots>>, { success: true }>;
type SlotProposal = SlotProposalsResult["proposals"][number];

// "Hívás eredménye" — the core lead interaction. Validation (note required,
// callback needs date+hour, meeting needs who) is enforced SERVER-side in
// lib/leads/service.ts; the `required` attributes here are just UX.

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", fontSize: 14,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

export function CallOutcomeModal({
  open, onClose, leadId, title, stageDescription, onLogged, scriptVariants = [],
}: {
  open: boolean;
  onClose: () => void;
  leadId: number;
  title?: string | null;
  stageDescription?: string | null;
  onLogged?: () => void;
  scriptVariants?: ScriptVariant[];
}) {
  const [outcome, setOutcome] = useState<string>("no_answer");
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [demoWith, setDemoWith] = useState<"aron" | "peter">("aron");
  const [bookingAt, setBookingAt] = useState("");
  const [bookingKind, setBookingKind] = useState<BookingKind | "">("");
  const [lostReason, setLostReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [slotsPending, startSlotsTransition] = useTransition();
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slotProposals, setSlotProposals] = useState<SlotProposal[]>([]);
  const [pickedConflicts, setPickedConflicts] = useState<SlotProposal["conflicts"] | null>(null);
  // A/B: deterministic per-lead assignment (leadId % length), not random or
  // "always A" — every variant needs data, and a re-render must not switch
  // the script mid-call. Empty ("Nincs szkript") when the tenant has none.
  const defaultScriptKey = scriptVariants[leadId % scriptVariants.length]?.key ?? "";
  const [scriptKey, setScriptKey] = useState(defaultScriptKey);
  const script = scriptVariants.find((v) => v.key === scriptKey) ?? null;

  function reset() {
    setOutcome("no_answer"); setNote(""); setCallbackAt(""); setDemoWith("aron"); setLostReason(""); setError(null);
    setBookingAt(""); setBookingKind(""); setSlotProposals([]); setSlotError(null); setPickedConflicts(null);
    setScriptKey(defaultScriptKey);
  }
  function handleClose() { reset(); onClose(); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await logLeadCall(leadId, {
        outcome, note,
        // datetime-local is wall-clock; Date parses it as local time → ISO for the wire.
        callbackAt: outcome === "callback_requested" && callbackAt ? new Date(callbackAt).toISOString() : null,
        demoWith: outcome === "meeting_booked" ? demoWith : null,
        bookingAt: outcome === "meeting_booked" && bookingAt ? new Date(bookingAt).toISOString() : null,
        bookingKind: outcome === "meeting_booked" ? bookingKind || null : null,
        lostReason: isLostCallOutcome(outcome) ? lostReason : null,
        scriptVariant: scriptKey || undefined,
      });
      if ("error" in res) { setError(res.error); return; }
      reset(); onClose(); onLogged?.();
    });
  }

  function suggestSlots() {
    if (!bookingKind) { setSlotError("Előbb válaszd ki a foglalás típusát"); return; }
    setSlotError(null);
    startSlotsTransition(async () => {
      const res = await proposeBookingSlots(leadId, bookingKind);
      if ("error" in res) { setSlotError(res.error); setSlotProposals([]); return; }
      setSlotProposals(res.proposals);
    });
  }

  function pickSlot(p: SlotProposal) {
    setBookingAt(toDatetimeLocal(new Date(p.startsAt)));
    setPickedConflicts(p.conflicts.length > 0 ? p.conflicts : null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hívás eredménye</DialogTitle>
          {title && <p className="text-sm" style={{ color: "var(--fg-mute)" }}>{title}</p>}
        </DialogHeader>
        {stageDescription && (
          <div style={{ fontSize: 12, color: "var(--fg-soft)", whiteSpace: "pre-wrap", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5, maxHeight: 180, overflowY: "auto" }}>
            {stageDescription}
          </div>
        )}
        {scriptVariants.length > 0 && (
          <FormField label="Szkript">
            <select style={inputStyle} value={scriptKey} onChange={(e) => setScriptKey(e.target.value)}>
              <option value="">Nincs szkript</option>
              {scriptVariants.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
            {script && script.body && (
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--fg-soft)", whiteSpace: "pre-wrap", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5, maxHeight: 220, overflowY: "auto" }}>
                {script.body}
              </div>
            )}
          </FormField>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Eredmény" required>
            <select style={inputStyle} value={outcome} onChange={(e) => setOutcome(e.target.value)} autoFocus>
              {CALL_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </FormField>

          {outcome === "callback_requested" && (
            <FormField label="Visszahívás időpontja (dátum + óra)" required>
              <input type="datetime-local" style={inputStyle} value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} required />
            </FormField>
          )}

          {outcome === "meeting_booked" && (
            <>
              <FormField label="Kivel lesz a demó?" required>
                <div className="flex gap-4" style={{ fontSize: 14 }}>
                  {(["aron", "peter"] as const).map((w) => (
                    <label key={w} className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
                      <input type="radio" name="demoWith" value={w} checked={demoWith === w} onChange={() => setDemoWith(w)} />
                      {w === "aron" ? "Áron" : "Péter"}
                    </label>
                  ))}
                </div>
              </FormField>

              <FormField label="Foglalás típusa" required>
                <select style={inputStyle} value={bookingKind} onChange={(e) => setBookingKind(e.target.value as BookingKind | "")}>
                  <option value="">Válassz típust</option>
                  {BOOKING_KINDS.map((k) => <option key={k} value={k}>{BOOKING_KIND_LABEL[k]}</option>)}
                </select>
              </FormField>

              <FormField label="Foglalás időpontja (dátum + óra)" required>
                <input
                  type="datetime-local" style={inputStyle} value={bookingAt} required
                  onChange={(e) => { setBookingAt(e.target.value); setPickedConflicts(null); }}
                />
                <div style={{ marginTop: 6 }}>
                  <Button type="button" variant="outline" onClick={suggestSlots} disabled={slotsPending}>
                    {slotsPending ? "Keresés…" : "Javasolj időpontot"}
                  </Button>
                </div>
                {slotError && <p className="text-sm" style={{ color: "var(--coral)", marginTop: 6 }}>{slotError}</p>}
                {slotProposals.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {slotProposals.map((p, i) => {
                      const d = new Date(p.startsAt);
                      const dateLabel = d.toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
                      const timeLabel = d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
                      const reasonLine = SLOT_REASON_LINE[p.reason] ?? "";
                      const kmLine = p.nearestKm != null ? ` · ${Math.round(p.nearestKm)} km` : "";
                      return (
                        <button
                          key={i} type="button" onClick={() => pickSlot(p)}
                          style={{ ...inputStyle, textAlign: "left", cursor: "pointer" }}
                        >
                          <strong>{dateLabel} {timeLabel}</strong> — {reasonLine}{kmLine}
                          {p.conflicts.length > 0 && (
                            <span style={{ color: "var(--amber)" }}> · ütközik</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {pickedConflicts && pickedConflicts.length > 0 && (
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "var(--amber-soft)", color: "var(--amber)", fontSize: 13 }}>
                    {pickedConflicts.map((c, i) => (
                      <p key={i} style={{ margin: 0 }}>
                        Ütközik: {c.otherTitle} ({new Date(c.otherStartsAt).toLocaleString("hu-HU")}) —{" "}
                        {c.movable === "other"
                          ? "ez az alacsonyabb prioritású, áthelyezhető."
                          : "ez az új foglalás az alacsonyabb prioritású, áthelyezhető."}
                      </p>
                    ))}
                  </div>
                )}
              </FormField>
            </>
          )}

          {isLostCallOutcome(outcome) && (
            <FormField label="Miért veszett el? (kötelező)" required>
              <input
                style={inputStyle}
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

          {error && <p className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={pending}>Mégse</Button>
            <Button type="submit" disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {pending ? "Mentés…" : "Rögzítés"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
