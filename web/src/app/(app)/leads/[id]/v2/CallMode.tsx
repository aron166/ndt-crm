"use client";

import { Button } from "@astryxdesign/core/Button";
import { Textarea } from "@/components/ui/textarea";
import type { CallOutcomeKey } from "@/lib/leads/outcomes";
import { OutcomePad } from "../detail/OutcomePad";
import s from "./lead2.module.css";

export function CallMode({ closed, note, onNote, onPick, onLog, onDone }: {
  closed: boolean;
  note: string;
  onNote: (v: string) => void;
  onPick: (k: CallOutcomeKey) => void;
  onLog: () => void;
  onDone: () => void;
}) {
  return (
    <section className={`${s.card} ${s.callMode}`} aria-label="Hívás">
      <div className={s.callTop}>
        <h2 className={s.h2}>{/* PROPOSAL copy */}Hívás eredménye</h2>
        <Button variant="secondary" label="Kész" onClick={onDone} />
      </div>
      <label className={s.field}>
        {/* PROPOSAL copy */}Jegyzet (kötelező)
        <Textarea className={s.note} rows={3} value={note} onChange={(e) => onNote(e.target.value)} />
      </label>
      <OutcomePad closed={closed} onPick={onPick} onLog={onLog} />
    </section>
  );
}
