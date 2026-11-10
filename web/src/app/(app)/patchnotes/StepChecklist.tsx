"use client";

import { useRef, useState, useTransition } from "react";
import { setPatchStepState } from "@/app/actions/patchnotes";
import { bugIssueUrl } from "@/lib/patchnotes/parse";
import { PATCH_UI } from "@/lib/patchnotes/labels";
import type { PatchState } from "@/lib/patchnotes/repos";
import k from "@/components/astryx/page.module.css";
import m from "./patchnotes.module.css";

type Props = { repo: string; prNumber: number; prTitle: string; steps: string[]; initial: Record<number, PatchState> };

const seg = (active: boolean) => (active ? m.stepOn : m.stepOff);

function StepText({ text }: { text: string }) {
  const match = /^(https?:\/\/\S+)(.*)$/.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <a href={match[1]} target="_blank" rel="noopener noreferrer" className={k.link}>{match[1]}</a>
      {match[2]}
    </>
  );
}

export function StepChecklist({ repo, prNumber, prTitle, steps, initial }: Props) {
  const [marks, setMarks] = useState<Record<number, PatchState>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const confirmed = useRef<Record<number, PatchState>>({ ...initial });
  // Latest click per step: only the latest settle may repaint that step.
  const seq = useRef<Record<number, number>>({});

  function apply(i: number, state: PatchState | null | undefined) {
    setMarks((cur) => {
      const n = { ...cur };
      if (state == null) delete n[i];
      else n[i] = state;
      return n;
    });
  }

  function set(i: number, state: PatchState | null) {
    setError(null);
    apply(i, state);
    const mine = (seq.current[i] = (seq.current[i] ?? 0) + 1);
    start(async () => {
      let err: string | null = null;
      try {
        const res = await setPatchStepState(repo, prNumber, i, state);
        if ("error" in res && res.error) err = res.error;
      } catch {
        err = PATCH_UI.saveFailed;
      }
      if (err === null) {
        if (state === null) delete confirmed.current[i];
        else confirmed.current[i] = state;
      } else {
        setError(err);
      }
      if (seq.current[i] === mine) apply(i, confirmed.current[i]);
    });
  }

  const vals = steps.map((_, i) => marks[i]);
  const ok = vals.filter((v) => v === "ok").length;
  const bug = vals.filter((v) => v === "bug").length;

  return (
    <div className={m.checklist}>
      <div className={k.muted}>{PATCH_UI.progress(ok, steps.length, bug)}</div>
      {steps.map((s, i) => (
        <div key={i} className={m.step}>
          <div className={m.stepText}>
            <span className="font-mono-ndt">{i + 1}. </span>
            <StepText text={s} />
          </div>
          <div className={m.stepBtns}>
            <button type="button" className={`${k.btn} ${seg(marks[i] === "ok")}`} aria-pressed={marks[i] === "ok"} onClick={() => set(i, "ok")}>
              {PATCH_UI.testOk}
            </button>
            {marks[i] === "bug" ? (
              <>
                <button type="button" className={`${k.btn} ${seg(true)}`} aria-pressed>
                  {PATCH_UI.bug}
                </button>
                <a className={`${k.link} ${m.openIssue}`} href={bugIssueUrl(repo, prNumber, prTitle, s)} target="_blank" rel="noopener noreferrer">
                  {PATCH_UI.openIssue}
                </a>
              </>
            ) : (
              <a
                className={`${k.btn} ${seg(false)}`}
                role="button"
                aria-pressed={false}
                href={bugIssueUrl(repo, prNumber, prTitle, s)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => set(i, "bug")}
                onAuxClick={(e) => {
                  if (e.button === 1) set(i, "bug");
                }}
              >
                {PATCH_UI.bug}
              </a>
            )}
            <button type="button" className={`${k.btn} ${seg(marks[i] === undefined)}`} aria-pressed={marks[i] === undefined} onClick={() => set(i, null)}>
              {PATCH_UI.notYet}
            </button>
          </div>
        </div>
      ))}
      {error && <div role="alert" className={m.error}>{error}</div>}
    </div>
  );
}
