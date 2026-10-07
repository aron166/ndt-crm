"use client";

import { useRef, useState, useTransition } from "react";
import { setPatchStepState } from "@/app/actions/patchnotes";
import { bugIssueUrl } from "@/lib/patchnotes/parse";
import { PATCH_UI } from "@/lib/patchnotes/labels";
import type { PatchState } from "@/lib/patchnotes/repos";

type Props = { repo: string; prNumber: number; prTitle: string; steps: string[]; initial: Record<number, PatchState> };

const seg = (active: boolean) => ({ fontWeight: active ? 700 : 400, opacity: active ? 1 : 0.7 }) as const;

function StepText({ text }: { text: string }) {
  const m = /^(https?:\/\/\S+)(.*)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <a href={m[1]} target="_blank" rel="noopener noreferrer" className="tbl-link">{m[1]}</a>
      {m[2]}
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
    setMarks((m) => {
      const n = { ...m };
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
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>{PATCH_UI.progress(ok, steps.length, bug)}</div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 240px", fontSize: 13, overflowWrap: "anywhere" }}>
            <span className="font-mono-ndt" style={{ color: "var(--fg-faint)" }}>{i + 1}. </span>
            <StepText text={s} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" className="btn sm" aria-pressed={marks[i] === "ok"} style={seg(marks[i] === "ok")} onClick={() => set(i, "ok")}>
              {PATCH_UI.testOk}
            </button>
            {marks[i] === "bug" ? (
              <>
                <button type="button" className="btn sm" aria-pressed style={seg(true)}>
                  {PATCH_UI.bug}
                </button>
                <a className="tbl-link" style={{ fontSize: 12, alignSelf: "center" }} href={bugIssueUrl(repo, prNumber, prTitle, s)} target="_blank" rel="noopener noreferrer">
                  {PATCH_UI.openIssue}
                </a>
              </>
            ) : (
              <a
                className="btn sm"
                role="button"
                aria-pressed={false}
                style={seg(false)}
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
            <button type="button" className="btn sm" aria-pressed={marks[i] === undefined} style={seg(marks[i] === undefined)} onClick={() => set(i, null)}>
              {PATCH_UI.notYet}
            </button>
          </div>
        </div>
      ))}
      {error && <div role="alert" style={{ fontSize: 12, color: "var(--destructive)" }}>{error}</div>}
    </div>
  );
}
