"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveQualificationQuestions } from "@/app/actions/leads";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { questionsToLines, type QualificationQuestion } from "@/lib/leads/qualification";

export function QualificationQuestionsClient({ questions }: { questions: QualificationQuestion[] }) {
  const router = useRouter();
  const [text, setText] = useState(questionsToLines(questions));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveQualificationQuestions(text);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div className="panel-title">Setter kérdések</div></div>
      <div className="panel-pad space-y-3">
        <p style={{ fontSize: 12, color: "var(--fg-mute)" }}>
          Soronként egy kérdés. Formátum: azonosító|kérdés szövege — vagy csak a kérdés, akkor az
          azonosító automatikus. A # sor megjegyzés. Az azonosítót ne írd át később, mert a már
          rögzített válaszok ahhoz tartoznak.
        </p>
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} className="font-mono-ndt" />
        {error && <p style={{ fontSize: 12, color: "var(--coral)" }}>{error}</p>}
        <Button className="btn primary" size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Mentés…" : "Mentés"}
        </Button>
      </div>
    </div>
  );
}
