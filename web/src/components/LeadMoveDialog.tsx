"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { moveLead, type MoveLeadDetails } from "@/app/actions/leads";
import {
  LOST_REASONS, LOST_REASON_LABEL, RECALL_REASONS, RECALL_REASON_LABEL, OFFER_TYPES, OFFER_TYPE_LABEL,
} from "@/lib/leads/lifecycle";


/** Stage-move dialog: collects the optional details, the server decides if the move is allowed. */
export function LeadMoveDialog({
  leadId, target, targetLabel, onClose, onMoved,
}: {
  leadId: number;
  target: string;
  targetLabel: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [nextAction, setNextAction] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [offerType, setOfferType] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [recallReason, setRecallReason] = useState("");
  const [recallDate, setRecallDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const d: Record<string, string> = {};
    const put = (k: string, v: string) => { if (v.trim()) d[k] = v.trim(); };
    const iso = (v: string) => (v ? new Date(v).toISOString() : "");
    put("nextAction", nextAction);
    put("nextDue", iso(nextDue));
    if (target === "qualified") put("offerType", offerType);
    if (target === "lost") { put("lostReason", lostReason); put("lostNote", lostNote); }
    if (target === "recall") { put("recallReason", recallReason); put("recallDate", iso(recallDate)); }
    setError(null);
    startTransition(async () => {
      const res = await moveLead(leadId, target, d as MoveLeadDetails);
      if (res && "error" in res) { setError(res.error); return; }
      onMoved();
    });
  }

  const label = (text: string, id: string) => (
    <label htmlFor={id} className="block text-sm" style={{ color: "var(--ui-text-muted)", marginBottom: 2 }}>{text}</label>
  );
  const select = (id: string, value: string, set: (v: string) => void, options: readonly string[], labels: Record<string, string>, empty = "-") => (
    <select id={id} value={value} onChange={(e) => set(e.target.value)} className="input-ds">
      <option value="">{empty}</option>
      {options.map((o) => <option key={o} value={o}>{labels[o] ?? o}</option>)}
    </select>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* PROPOSAL copy */}
          <DialogTitle>Áthelyezés: {targetLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            {/* PROPOSAL copy */}
            {label("Következő lépés", "move-next-action")}
            <Input id="move-next-action" type="text" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          </div>
          <div>
            {/* PROPOSAL copy */}
            {label("Határidő", "move-next-due")}
            <Input id="move-next-due" type="datetime-local" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </div>
          {target === "qualified" && (
            <div>
              {/* PROPOSAL copy */}
              {label("Ajánlat típusa", "move-offer-type")}
              {select("move-offer-type", offerType, setOfferType, OFFER_TYPES, OFFER_TYPE_LABEL)}
            </div>
          )}
          {target === "lost" && (
            <>
              <div>
                {/* PROPOSAL copy */}
                {label("Elvesztés oka", "move-lost-reason")}
                {select("move-lost-reason", lostReason, setLostReason, LOST_REASONS, LOST_REASON_LABEL, "Válassz okot" /* PROPOSAL copy */)}
              </div>
              <div>
                {/* PROPOSAL copy */}
                {label(lostReason === "other" ? "Megjegyzés (kötelező)" : "Megjegyzés", "move-lost-note")}
                <Textarea id="move-lost-note" rows={3} value={lostNote} onChange={(e) => setLostNote(e.target.value)} />
              </div>
            </>
          )}
          {target === "recall" && (
            <>
              <div>
                {/* PROPOSAL copy */}
                {label("Visszahívás oka", "move-recall-reason")}
                {select("move-recall-reason", recallReason, setRecallReason, RECALL_REASONS, RECALL_REASON_LABEL)}
              </div>
              <div>
                {/* PROPOSAL copy */}
                {label("Visszahívás dátuma", "move-recall-date")}
                <Input id="move-recall-date" type="datetime-local" value={recallDate} onChange={(e) => setRecallDate(e.target.value)} />
              </div>
            </>
          )}
        </div>
        {error && <p role="alert" className="text-sm" style={{ color: "var(--ui-danger-text)" }}>{error}</p>}
        <DialogFooter>
          {/* PROPOSAL copy */}
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Mégse</Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Mentés…" : "Áthelyezés"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
