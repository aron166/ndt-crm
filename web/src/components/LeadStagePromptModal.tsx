"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getLeadStagePrompt, moveLead } from "@/app/actions/leads";

// Péter's rule (BRIEFING addendum 2026-09-07 P0 #4): "ticking a task must NOT
// silently advance the stage — it's ambiguous → prompt for the phase". So
// completing a lead call task asks, it never guesses: keep the stage, or pick.
//
// The card→task direction is the server's job (changeLeadStatus completes the
// open callback task); this is only the task→card direction.

type Prompt = Awaited<ReturnType<typeof getLeadStagePrompt>>;

export function LeadStagePromptModal({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState<Prompt | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getLeadStagePrompt(taskId).then((p) => {
      if (!alive) return;
      setPrompt(p);
      // A task on a closed/absent lead has nothing to ask about — don't nag.
      if (p === null) onClose();
      else setPicked(p.currentStatus);
    });
    return () => { alive = false; };
  }, [taskId, onClose]);

  if (!prompt) return null;

  const unchanged = picked === prompt.currentStatus;

  function handleSave() {
    if (!prompt || !picked || unchanged) { onClose(); return; }
    setError(null);
    startTransition(async () => {
      const res = await moveLead(prompt.leadId, picked!);
      if ("error" in res) { setError(res.error); return; }
      onClose();
      router.refresh();
    });
  }

  const pickedDescription = prompt.statuses.find((s) => s.key === picked)?.description ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Melyik fázisba kerüljön?</DialogTitle>
          <p className="text-sm" style={{ color: "var(--fg-mute)" }}>{prompt.title}</p>
        </DialogHeader>

        <div className="space-y-2">
          {prompt.statuses.map((s) => (
            <label
              key={s.key}
              className="flex items-center gap-2"
              style={{
                fontSize: 14, cursor: "pointer", padding: "6px 10px", borderRadius: 6,
                border: `1px solid ${picked === s.key ? "var(--indigo)" : "var(--line-soft)"}`,
                background: picked === s.key ? "var(--bg-hover)" : "transparent",
              }}
            >
              <input type="radio" name="stage" checked={picked === s.key} onChange={() => setPicked(s.key)} />
              {s.label}
              {s.key === prompt.currentStatus && (
                <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>· jelenlegi</span>
              )}
            </label>
          ))}
        </div>

        {pickedDescription && (
          <div style={{ fontSize: 12, color: "var(--fg-soft)", whiteSpace: "pre-wrap", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "8px 10px", lineHeight: 1.5, maxHeight: 160, overflowY: "auto" }}>
            {pickedDescription}
          </div>
        )}

        {error && <p className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Marad ahol van
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending || unchanged}
            className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {pending ? "Mentés…" : "Áthelyezés"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
