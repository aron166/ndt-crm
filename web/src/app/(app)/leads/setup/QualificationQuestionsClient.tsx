"use client";
// Hungarian copy is PROPOSAL until Áron approves.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Plus, Trash2, AlertTriangle } from "lucide-react";
import { saveQualificationQuestions } from "@/app/actions/leads";
import k from "@/components/astryx/page.module.css";
import m from "./setup.module.css";
import {
  ANSWER_TYPES,
  BRANCHES,
  AUDIENCES,
  LABEL_MAX,
  questionsInSet,
  type QualificationQuestion,
  type QuestionSet,
} from "@/lib/leads/qualification";

const TYPE_LABELS: Record<string, string> = {
  choice: "választós",
  text: "szöveges",
  number: "szám",
  postcode: "irányítószám",
  contact: "elérhetőség (név, telefonszám)",
};
const BRANCH_LABELS: Record<string, string> = { task: "csak konkrét feladatnál", curious: "csak érdeklődőnél" };
const AUDIENCE_LABELS: Record<string, string> = { company: "csak cégnél", private: "csak magánszemélynél" };

function emptyQuestion(setKey: string): QualificationQuestion {
  return { slug: "", label: "", sets: [setKey] };
}

export function QualificationQuestionsClient({
  questions,
  sets,
  introUrl,
}: {
  questions: QualificationQuestion[];
  sets: QuestionSet[];
  introUrl: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(questions);
  const [activeSet, setActiveSet] = useState(sets[0]?.key ?? "");
  const [url, setUrl] = useState(introUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(i: number, p: Partial<QualificationQuestion>) {
    setItems((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...p } : q)));
  }

  function toggleSet(i: number, key: string, on: boolean) {
    setItems((prev) =>
      prev.map((q, idx) => {
        if (idx !== i) return q;
        const cur = q.sets ?? [];
        return { ...q, sets: on ? [...cur, key] : cur.filter((sk) => sk !== key) };
      }),
    );
  }

  function moveInSet(i: number, direction: -1 | 1) {
    const visibleIdx = items.map((q, idx) => idx).filter((idx) => (items[idx].sets ?? []).includes(activeSet));
    const pos = visibleIdx.indexOf(i);
    const swapWith = visibleIdx[pos + direction];
    if (swapWith === undefined) return;
    setItems((prev) => {
      const next = [...prev];
      [next[i], next[swapWith]] = [next[swapWith], next[i]];
      return next;
    });
  }

  function addQuestion() {
    setItems((prev) => [...prev, emptyQuestion(activeSet)]);
  }

  function removeQuestion(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveQualificationQuestions(items, sets, url);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  const visible = questionsInSet(items, activeSet).map((q) => ({ q, i: items.indexOf(q) }));

  return (
    <section className={k.section}>
      <h2 className={k.h2}>Setter kérdések</h2>
      <div className={m.tabs} role="tablist">
        {sets.map((st) => (
          <button
            key={st.key}
            type="button"
            role="tab"
            aria-selected={activeSet === st.key}
            onClick={() => setActiveSet(st.key)}
            className={`${m.tab} ${activeSet === st.key ? m.tabOn : ""}`}
          >
            {st.label}
          </button>
        ))}
      </div>

      <div className={m.list}>
        {visible.map(({ q, i }, pos) => {
          const noSets = (q.sets ?? []).length === 0;
          return (
            <div key={i} className={k.card}>
              <div className={m.rowHead}>
                <div className={k.muted}>
                  azonosító: <code>{q.slug || "(új, mentéskor kapja)"}</code> (statisztikai kulcs, soha nem változik)
                </div>
                <div className={m.iconRow}>
                  <button type="button" aria-label="Feljebb" onClick={() => moveInSet(i, -1)} disabled={pos === 0} className={`${k.btn} ${k.btnIcon}`}>
                    <ArrowUp style={{ width: 13, height: 13 }} />
                  </button>
                  <button type="button" aria-label="Lejjebb" onClick={() => moveInSet(i, 1)} disabled={pos === visible.length - 1} className={`${k.btn} ${k.btnIcon}`}>
                    <ArrowDown style={{ width: 13, height: 13 }} />
                  </button>
                  <button type="button" aria-label="Kérdés törlése" onClick={() => removeQuestion(i)} className={`${k.btn} ${k.btnIcon}`}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>

              <div>
                <label className={m.label}>Kérdés szövege (űrlap)</label>
                <input className={m.field} value={q.label} maxLength={LABEL_MAX} onChange={(e) => patch(i, { label: e.target.value })} />
              </div>
              <div>
                <label className={m.label}>Kérdés szövege (telefon), üresen az űrlap szövege hangzik el</label>
                <input className={m.field} value={q.phoneLabel ?? ""} maxLength={LABEL_MAX} onChange={(e) => patch(i, { phoneLabel: e.target.value || undefined })} />
              </div>

              <div className={m.fieldRow}>
                <div>
                  <label className={m.label}>Válasz típusa</label>
                  <select
                    value={q.type ?? "text"}
                    onChange={(e) => patch(i, { type: e.target.value === "text" ? undefined : (e.target.value as QualificationQuestion["type"]) })}
                    className={m.field}
                  >
                    {ANSWER_TYPES.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={m.label}>Ág</label>
                  <select
                    value={q.branch ?? ""}
                    onChange={(e) => patch(i, { branch: (e.target.value || undefined) as QualificationQuestion["branch"] })}
                    className={m.field}
                  >
                    <option value="">mindkettő</option>
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>{BRANCH_LABELS[b] ?? b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={m.label}>Célközönség</label>
                  <select
                    value={q.audience ?? ""}
                    onChange={(e) => patch(i, { audience: (e.target.value || undefined) as QualificationQuestion["audience"] })}
                    className={m.field}
                  >
                    <option value="">mindkettő</option>
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>{AUDIENCE_LABELS[a] ?? a}</option>
                    ))}
                  </select>
                </div>
              </div>

              {q.type === "choice" && (
                <div>
                  <label className={m.label}>Válaszlehetőségek (soronként egy)</label>
                  <textarea
                    rows={3}
                    value={(q.options ?? []).join("\n")}
                    onChange={(e) => patch(i, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                    className={`${m.field} ${m.textarea} font-mono-ndt`}
                  />
                </div>
              )}

              <div className={m.checks}>
                {/* Not choice-only: a free-text question is exactly where the
                    "egyéb" answers are meant to accumulate (raw46 D11). */}
                <label className={m.check}>
                  <input type="checkbox" checked={q.allowOther ?? false} onChange={(e) => patch(i, { allowOther: e.target.checked })} />
                  Egyéb szabad szöveg engedélyezve
                </label>
                <label className={m.check}>
                  <input type="checkbox" checked={q.required ?? false} onChange={(e) => patch(i, { required: e.target.checked })} />
                  Kötelező
                </label>
              </div>

              <div>
                <label className={m.label}>Kérdéscsoportok</label>
                <div className={m.checks}>
                  {sets.map((st) => (
                    <label key={st.key} className={m.check}>
                      <input
                        type="checkbox"
                        checked={(q.sets ?? []).includes(st.key)}
                        onChange={(e) => toggleSet(i, st.key, e.target.checked)}
                      />
                      {st.label}
                    </label>
                  ))}
                </div>
                {noSets && (
                  // Not "sehol nem lesz feltéve": questionsFromSettings puts a
                  // set-less question back into the discovery set, so the
                  // warning has to say what actually happens. Retiring a
                  // question is the delete button. (Vanda, #113.)
                  <p className={m.warn}>
                    <AlertTriangle size={12} aria-hidden="true" /> Egyik kérdéscsoportban sincs: mentés után a felmérő kérdések közé kerül. Végleges eltávolításhoz töröld.
                  </p>
                )}
              </div>
            </div>
          );
        })}

        <div>
          <button
            type="button"
            className={k.btn}
            onClick={addQuestion}
          >
            <Plus style={{ width: 14, height: 14 }} /> Kérdés hozzáadása
          </button>
        </div>
      </div>

      <div>
        <label className={m.label}>Termékismertető linkje</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className={`${m.field} font-mono-ndt`}
        />
        <p className={`${k.muted} ${m.hint}`}>
          Ezt a linket kapja a lead, ha a landing űrlap a termékismertetőt kéri
          (send_intro). Amíg üres, a levélben helykitöltő szerepel.
        </p>
      </div>

      {error && <p className={m.error}>{error}</p>}
      <div>
        <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={handleSave} disabled={isPending}>
          {isPending ? "Mentés…" : "Mentés"}
        </button>
      </div>
    </section>
  );
}
