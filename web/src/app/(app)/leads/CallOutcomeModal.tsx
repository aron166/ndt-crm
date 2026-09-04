"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { logLeadCall } from "@/app/actions/leads";
import { CALL_OUTCOMES } from "@/lib/leads/outcomes";

// "Hívás eredménye" — the core lead interaction. Validation (note required,
// callback needs date+hour, meeting needs who) is enforced SERVER-side in
// lib/leads/service.ts; the `required` attributes here are just UX.

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", fontSize: 13,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

export function CallOutcomeModal({
  open, onClose, leadId, title, onLogged,
}: {
  open: boolean;
  onClose: () => void;
  leadId: number;
  title?: string | null;
  onLogged?: () => void;
}) {
  const [outcome, setOutcome] = useState<string>("no_answer");
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [demoWith, setDemoWith] = useState<"aron" | "peter">("aron");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOutcome("no_answer"); setNote(""); setCallbackAt(""); setDemoWith("aron"); setError(null);
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
      });
      if ("error" in res) { setError(res.error); return; }
      reset(); onClose(); onLogged?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hívás eredménye</DialogTitle>
          {title && <p className="text-sm" style={{ color: "var(--fg-mute)" }}>{title}</p>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">Eredmény *</label>
            <select style={inputStyle} value={outcome} onChange={(e) => setOutcome(e.target.value)} autoFocus>
              {CALL_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          {outcome === "callback_requested" && (
            <div>
              <label className="field-label">Visszahívás időpontja (dátum + óra) *</label>
              <input type="datetime-local" style={inputStyle} value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} required />
            </div>
          )}

          {outcome === "meeting_booked" && (
            <div>
              <label className="field-label">Kivel lesz a demó? *</label>
              <div className="flex gap-4" style={{ fontSize: 13 }}>
                {(["aron", "peter"] as const).map((w) => (
                  <label key={w} className="flex items-center gap-1.5" style={{ cursor: "pointer" }}>
                    <input type="radio" name="demoWith" value={w} checked={demoWith === w} onChange={() => setDemoWith(w)} />
                    {w === "aron" ? "Áron" : "Péter"}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="field-label">Megjegyzés *</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} required
              placeholder="Mi hangzott el? Mi a következő lépés?" />
          </div>

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
