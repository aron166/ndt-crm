"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { logLeadCall } from "@/app/actions/leads";
import { CALL_OUTCOMES, isLostCallOutcome, LOST_REASON_MAX } from "@/lib/leads/outcomes";
import { FormField } from "@/components/ui/FormField";
import type { ScriptVariant } from "@/lib/leads/scripts";

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
  const [lostReason, setLostReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A/B: deterministic per-lead assignment (leadId % length), not random or
  // "always A" — every variant needs data, and a re-render must not switch
  // the script mid-call. Empty ("Nincs szkript") when the tenant has none.
  const defaultScriptKey = scriptVariants[leadId % scriptVariants.length]?.key ?? "";
  const [scriptKey, setScriptKey] = useState(defaultScriptKey);
  const script = scriptVariants.find((v) => v.key === scriptKey) ?? null;

  function reset() {
    setOutcome("no_answer"); setNote(""); setCallbackAt(""); setDemoWith("aron"); setLostReason(""); setError(null);
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
        lostReason: isLostCallOutcome(outcome) ? lostReason : null,
        scriptVariant: scriptKey || undefined,
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
