"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLeadQualification } from "@/app/actions/leads";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ANSWER_MAX,
  phoneWording,
  legacyAnswers,
  type AnswerSources,
  type QualificationQuestion,
  type QuestionSet,
} from "@/lib/leads/qualification";
import { formatDateTime } from "@/lib/utils";

/** The setter's own answers, one per slug — never the form's. */
function setterAnswersFrom(sources: AnswerSources): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, rec] of Object.entries(sources)) {
    if (rec.setter?.value) out[slug] = rec.setter.value;
  }
  return out;
}

function DraftChip() {
  return (
    <span
      className="badge-ds"
      style={{ marginLeft: 6, color: "var(--fg-faint)", borderColor: "var(--line-soft)", fontWeight: 500 }}
      title="A kérdés szövege még javaslat, Áron véglegesíti"
    >
      javaslat
    </span>
  );
}

/** Block 1 — read-only: what the form/lead itself said, with its provenance. */
function FormAnswersBlock({
  questions,
  sources,
  qualification,
  campaign,
  receivedDate,
  sets,
}: {
  questions: QualificationQuestion[];
  sources: AnswerSources;
  qualification: Record<string, string>;
  campaign: string | null;
  receivedDate: string | Date | null;
  sets: QuestionSet[];
}) {
  const bySlug = new Map(questions.map((q) => [q.slug, q]));
  const formEntries = Object.entries(sources).filter(([, rec]) => rec.form);
  const legacy = legacyAnswers(sources, qualification);
  const legacyEntries = Object.entries(legacy);

  // The set is a property of the form submission, not of one question — any
  // form answer's `set` names it, they all share one (per the intake design).
  const anyForm = formEntries.find(([, rec]) => rec.form)?.[1]?.form;
  const setKey = anyForm?.set ?? null;
  const when = receivedDate ?? anyForm?.at ?? null;

  const headerParts = [
    campaign ? `kampány: ${campaign}` : null,
    // The stored value is the set KEY; show the tenant's name for it, falling
    // back to the key when the set has since been renamed away.
    setKey ? `kérdéscsoport: ${sets.find((x) => x.key === setKey)?.label ?? setKey}` : null,
    when ? formatDateTime(when) : null,
  ].filter(Boolean);

  return (
    <div className="panel">
      <div className="panel-head"><div className="panel-title">Az űrlapon ezt válaszolta</div></div>
      <div className="panel-pad space-y-3">
        {headerParts.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--fg-mute)" }}>{headerParts.join(" · ")}</div>
        )}

        {formEntries.length === 0 && legacyEntries.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>Nincs űrlapos válasz.</div>
        ) : (
          <>
            {formEntries.map(([slug, rec]) => {
              const q = bySlug.get(slug);
              return (
                <div key={slug} className="flex justify-between" style={{ fontSize: 13, gap: 10 }}>
                  <span style={{ color: q ? "var(--fg-mute)" : "var(--fg-faint)" }}>
                    {q ? q.label : slug}
                    {!q && <span style={{ fontStyle: "italic" }}> (kérdés törölve)</span>}
                  </span>
                  <span style={{ color: "var(--fg)", textAlign: "right" }}>{rec.form!.value}</span>
                </div>
              );
            })}

            {legacyEntries.length > 0 && (
              <div style={{ paddingTop: 8, marginTop: 4, borderTop: "1px solid var(--line-soft)" }}>
                <div style={{ fontSize: 11, color: "var(--fg-faint)", marginBottom: 6 }}>
                  forrás ismeretlen (a rögzítés előttről)
                </div>
                <div className="space-y-2">
                  {legacyEntries.map(([slug, value]) => {
                    const q = bySlug.get(slug);
                    return (
                      <div key={slug} className="flex justify-between" style={{ fontSize: 13, gap: 10 }}>
                        <span style={{ color: "var(--fg-faint)" }}>{q ? q.label : slug}</span>
                        <span style={{ color: "var(--fg-faint)", textAlign: "right" }}>{value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Block 2 — today's panel: the setter's own answers, editable, never pre-filled from the form. */
function CallAnswersBlock({
  leadId,
  questions,
  sources,
}: {
  leadId: number;
  questions: QualificationQuestion[];
  sources: AnswerSources;
}) {
  const router = useRouter();
  const answers = setterAnswersFrom(sources);
  const [draft, setDraft] = useState<Record<string, string>>(answers);
  const [prevAnswers, setPrevAnswers] = useState(answers);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Render-phase sync when the server sends fresh answers (same idiom as
  // LeadStatusSetupClient) — never a useEffect that fights the user's typing.
  if (JSON.stringify(prevAnswers) !== JSON.stringify(answers)) {
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
      <div className="panel-head"><div className="panel-title">Amit a hívásból tudunk</div></div>
      <div className="panel-pad space-y-3">
        {questions.map((q) => {
          const rec = sources[q.slug];
          // A one-line answer gets a one-line field; number/postcode and
          // anything longer keep the textarea the setter has today.
          const oneLine = q.type === "choice" || q.type === "text" || q.type === "contact";
          return (
            <div key={q.slug}>
              <label className="field-label">
                {phoneWording(q)}
                {q.required && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--coral)" }}>kötelező</span>
                )}
                {q.draft && <DraftChip />}
              </label>
              {oneLine ? (
                <Input
                  maxLength={ANSWER_MAX}
                  value={draft[q.slug] ?? ""}
                  onChange={(e) => handleChange(q.slug, e.target.value)}
                  list={q.type === "choice" ? `q-${q.slug}-options` : undefined}
                />
              ) : (
                <Textarea
                  rows={2}
                  maxLength={ANSWER_MAX}
                  value={draft[q.slug] ?? ""}
                  onChange={(e) => handleChange(q.slug, e.target.value)}
                />
              )}
              {q.type === "choice" && q.options && q.options.length > 0 && (
                <>
                  <datalist id={`q-${q.slug}-options`}>
                    {q.options.map((o) => <option key={o} value={o} />)}
                  </datalist>
                  <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 2 }}>
                    {q.options.join(" · ")}
                  </div>
                </>
              )}
              {rec?.form && (
                <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 2 }}>
                  Űrlapon: «{rec.form.value}» · {formatDateTime(rec.form.at)}
                </div>
              )}
              {rec?.setter && rec?.form && (
                // Only where there is a form answer to outrank — on a slug the
                // form never answered, "ez az érvényes" says nothing.
                <div style={{ fontSize: 11, color: "var(--mint)", marginTop: 2 }}>ez az érvényes</div>
              )}
            </div>
          );
        })}
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

export function LeadQualificationPanel({
  leadId,
  questions,
  answerSources,
  qualification,
  campaign,
  receivedDate,
  sets,
}: {
  leadId: number;
  questions: QualificationQuestion[];
  answerSources: AnswerSources;
  qualification: Record<string, string>;
  campaign: string | null;
  receivedDate: string | Date | null;
  sets: QuestionSet[];
}) {
  return (
    <div className="space-y-4">
      <FormAnswersBlock
        questions={questions}
        sources={answerSources}
        qualification={qualification}
        campaign={campaign}
        receivedDate={receivedDate}
        sets={sets}
      />
      <CallAnswersBlock leadId={leadId} questions={questions} sources={answerSources} />
    </div>
  );
}
