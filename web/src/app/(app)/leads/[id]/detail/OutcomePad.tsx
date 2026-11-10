"use client";

import { Phone } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { CALL_OUTCOMES, type CallOutcomeKey } from "@/lib/leads/outcomes";
import s from "./lead.module.css";

// PROPOSAL copy: code tiles and one-line hints, keyed by outcome key.
const PAD_META: Record<string, { code: string; hint: string }> = {
  no_answer: { code: "NV", hint: "kísérlet +1, következő hívás a ritmus szerint" },
  callback_requested: { code: "VH", hint: "dátum kötelező" },
  meeting_booked: { code: "IF", hint: "időpont a foglalás panelen" },
  not_interested: { code: "NE", hint: "ok kötelező" },
  wrong_number: { code: "HS", hint: "hibás elérhetőség" },
  disqualified: { code: "NR", hint: "ok kötelező" },
};

// Pad order from the spec: the common outcomes first.
const PAD_ORDER: CallOutcomeKey[] = ["no_answer", "callback_requested", "meeting_booked", "not_interested", "wrong_number", "disqualified"];

export function OutcomePad({ closed, onPick, onLog }: { closed: boolean; onPick: (key: CallOutcomeKey) => void; onLog: () => void }) {
  const items = PAD_ORDER.map((k) => CALL_OUTCOMES.find((o) => o.key === k)).filter((o): o is (typeof CALL_OUTCOMES)[number] => !!o);
  return (
    <>
      <div className={s.pad} role="group" aria-label="Hívás eredménye">
        {items.map((o) => (
          <button key={o.key} type="button" disabled={closed} onClick={() => onPick(o.key)}>
            <span className={s.code}>{PAD_META[o.key]?.code ?? o.label.slice(0, 2).toUpperCase()}</span>
            <span className={s.lbl}>{o.label}</span>
            <span className={s.hint}>{PAD_META[o.key]?.hint ?? ""}</span>
          </button>
        ))}
      </div>
      {closed && <p className={s.closedNote}>{/* PROPOSAL copy */}Lezárt leadnél nincs hívásnapló.</p>}
      <div>
        <Button variant="ghost" size="sm" label="Hívás rögzítése" icon={<Phone size={14} />} isDisabled={closed} onClick={onLog} />
      </div>
    </>
  );
}
