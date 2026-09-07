"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveQualificationQuestions } from "@/app/actions/leads";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { questionsToLines, type QualificationQuestion } from "@/lib/leads/qualification";

export function QualificationQuestionsClient({
  questions,
  introUrl,
}: {
  questions: QualificationQuestion[];
  introUrl: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(questionsToLines(questions));
  const [url, setUrl] = useState(introUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveQualificationQuestions(text, url);
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

        <div>
          <label className="field-label">Termékismertető linkje</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://â¦"
            className="font-mono-ndt"
          />
          <p style={{ fontSize: 12, color: "var(--fg-mute)", marginTop: 4 }}>
            Ezt a linket kapja a lead, ha a landing űrlap a termékismertetőt kéri
            (send_intro). Amíg üres, a levélben helykitöltő szerepel.
          </p>
        </div>

        {error && <p style={{ fontSize: 12, color: "var(--coral)" }}>{error}</p>}
        <Button className="btn primary" size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Mentés…" : "Mentés"}
        </Button>
      </div>
    </div>
  );
}
