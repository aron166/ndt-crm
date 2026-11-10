"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextArea } from "@astryxdesign/core/TextArea";
import { postCheck, type CheckResultDto, type MachineDto, type SearchBody } from "./booking-api";
import { blockSentences, checkMachine, fmtDate, localInputToIso } from "./booking-view";
import { SlotCard } from "./SlotCard";
import css from "./booking.module.css";

export interface BookArgs { startsAt: string; machineId?: number; overrideReason?: string }

/** "Más időpont": a hand-typed time, checked before any book button is enabled. */
export function ManualTimeCheck({ search, machines, onBook, pending, bookError }: {
  search: SearchBody;
  machines: MachineDto[];
  onBook: (a: BookArgs) => void;
  pending: boolean;
  bookError: string | null;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResultDto | null>(null);
  const [altKey, setAltKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function run() {
    const startsAt = localInputToIso(value);
    if (!startsAt) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setReason("");
    const r = await postCheck({ ...search, startsAt });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResult(r.data);
    setAltKey(r.data.alternatives[0] ? `${r.data.alternatives[0].machineId}@${r.data.alternatives[0].startsAt}` : null);
  }

  const best = result ? checkMachine(result) : null;
  const baseOf = (id: number) => machines.find((m) => m.id === id)?.base.name ?? "Bázis"; // PROPOSAL copy
  const nameOf = (id: number) => machines.find((m) => m.id === id)?.name;
  const alt = result?.alternatives.find((a) => `${a.machineId}@${a.startsAt}` === altKey) ?? null;
  const reasonOk = reason.trim().length >= 5 && reason.length <= 500;
  const multi = machines.length > 1;

  return (
    <details>
      <summary className={css.disc}>Más időpont</summary>
      <div className={css.stack}>
        <label className={css.field}>
          Időpont (budapesti idő)
          <input className={css.input} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <Button variant="secondary" label="Ellenőrzés" isLoading={busy} isDisabled={!value} onClick={run} />
        {error && <span className={css.err} role="alert">{error}</span>}

        {result && best && result.feasible && (
          <>
            <SlotCard slot={{ ...best, bundles: result.bundles }} selected baseName={baseOf(best.machineId)} machineName={multi ? best.machineName : undefined} onSelect={() => {}} />
            <Button variant="primary" size="lg" width="100%" label={`Foglalás erre: ${fmtDate(result.startsAt)}`} isLoading={pending} onClick={() => onBook({ startsAt: result.startsAt, machineId: best.machineId })} />
          </>
        )}

        {result && !result.feasible && (
          <>
            <div className={css.stack} role="status">
              <strong>Erre az időpontra nem lehet foglalni:</strong>{/* PROPOSAL copy */}
              {(best ? blockSentences(best) : []).map((s) => <span key={s} className={css.warn}>{s}</span>)}
            </div>
            {result.alternatives.length > 0 && (
              <div className={css.stack}>
                <strong>Elérhető közeli időpontok:</strong>{/* PROPOSAL copy */}
                {result.alternatives.map((a, i) => {
                  const k = `${a.machineId}@${a.startsAt}`;
                  return <SlotCard key={k} slot={a} rank={i + 1} selected={altKey === k} onSelect={() => setAltKey(k)} baseName={baseOf(a.machineId)} machineName={multi ? nameOf(a.machineId) : undefined} />;
                })}
                <Button variant="primary" size="lg" width="100%" label={alt ? `Foglalás erre: ${fmtDate(alt.startsAt)}` : "Foglalás"} isDisabled={!alt} isLoading={pending} onClick={() => alt && onBook({ startsAt: alt.startsAt, machineId: alt.machineId })} />
              </div>
            )}
            <TextArea label="Miért foglalod mégis?" value={reason} onChange={setReason} rows={3} maxLength={500} description={`${reason.length}/500, legalább 5 karakter`} /> {/* PROPOSAL copy */}
            <Button
              variant="destructive"
              size="lg"
              width="100%"
              label="Mégis foglalom" // PROPOSAL copy
              isDisabled={!reasonOk}
              isLoading={pending}
              onClick={() => onBook({ startsAt: result.startsAt, machineId: result.machines[0]?.machineId, overrideReason: reason.trim() })}
            />
          </>
        )}
        {bookError && <span className={css.err} role="alert">{bookError}</span>}
      </div>
    </details>
  );
}
