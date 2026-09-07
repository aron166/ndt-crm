"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLeadQualification } from "@/app/actions/leads";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ANSWER_MAX } from "@/lib/leads/qualification";

interface Question {
  slug: string;
  label: string;
}

export function LeadQualificationPanel({
  leadId,
  questions,
  answers,
}: {
  leadId: number;
  questions: Question[];
  answers: Record<string, string>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(answers);
  const [prevAnswers, setPrevAnswers] = useState(answers);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Render-phase sync when the server sends fresh answers (same idiom as
  // LeadStatusSetupClient) — never a useEffect that fights the user's typing.
  if (prevAnswers !== answers) {
    setPrevAnswers(answers);
    setDraft(answers);
  }

  if (questions.length === 0) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(answers);

  function handleChange(slug: string, value: string) {
    setDraft((d) => ({ ...d, [slug]: value }));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveLeadQualification(leadId, draft);
      if ("error" in res) { setError(res.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="panel">
      <div className="panel-head"><div className="panel-title">Setter — minősítő kérdések</div></div>
      <div className="panel-pad space-y-3">
        {questions.map((q) => (
          <div key={q.slug}>
            <label className="field-label">{q.label}</label>
            <Textarea
              rows={2}
              maxLength={ANSWER_MAX}
              value={draft[q.slug] ?? ""}
              onChange={(e) => handleChange(q.slug, e.target.value)}
            />
          </div>
        ))}
        {error && <p style={{ fontSize: 12, color: "var(--coral)" }}>{error}</p>}
        <div className="flex items-center gap-2">
          <Button className="btn primary" size="sm" onClick={handleSave} disabled={isPending || !dirty}>
            {isPending ? "Mentés…" : "Mentés"}
          </Button>
          {saved && !dirty && <span style={{ fontSize: 12, color: "var(--mint)" }}>Mentve</span>}
        </div>
      </div>
    </div>
  );
}
