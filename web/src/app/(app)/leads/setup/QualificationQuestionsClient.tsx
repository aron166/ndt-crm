"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Plus, Trash2, AlertTriangle } from "lucide-react";
import { saveQualificationQuestions } from "@/app/actions/leads";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
        return { ...q, sets: on ? [...cur, key] : cur.filter((k) => k !== key) };
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
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div className="panel-title">Setter kérdések</div></div>
      <div className="panel-pad space-y-3">
        <div className="flex gap-1 flex-wrap" role="tablist">
          {sets.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={activeSet === s.key}
              onClick={() => setActiveSet(s.key)}
              className="badge-ds"
              style={{
                cursor: "pointer",
                border: "1px solid var(--line-soft)",
                background: activeSet === s.key ? "var(--indigo)" : "var(--bg-panel)",
                color: activeSet === s.key ? "#fff" : "var(--fg-soft)",
                padding: "4px 10px",
                fontSize: 12,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {visible.map(({ q, i }, pos) => {
            const noSets = (q.sets ?? []).length === 0;
            return (
              <div key={i} className="rounded-xl p-4 space-y-2" style={{ border: "1px solid var(--line-soft)", background: "var(--bg-panel)" }}>
                <div className="flex items-center justify-between">
                  <div style={{ fontSize: 11, color: "var(--fg-mute)" }}>
                    azonosító: <code>{q.slug || "(új, mentéskor kapja)"}</code> (statisztikai kulcs, soha nem változik)
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveInSet(i, -1)} disabled={pos === 0}
                      style={{ padding: 4, color: "var(--fg-faint)", cursor: pos === 0 ? "default" : "pointer", background: "none", border: "none", opacity: pos === 0 ? 0.4 : 1 }}>
                      <ArrowUp style={{ width: 13, height: 13 }} />
                    </button>
                    <button type="button" onClick={() => moveInSet(i, 1)} disabled={pos === visible.length - 1}
                      style={{ padding: 4, color: "var(--fg-faint)", cursor: pos === visible.length - 1 ? "default" : "pointer", background: "none", border: "none", opacity: pos === visible.length - 1 ? 0.4 : 1 }}>
                      <ArrowDown style={{ width: 13, height: 13 }} />
                    </button>
                    <button type="button" onClick={() => removeQuestion(i)}
                      style={{ padding: 4, color: "var(--fg-faint)", cursor: "pointer", background: "none", border: "none" }}
                      onMouseOver={(e) => (e.currentTarget.style.color = "var(--coral)")}
                      onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-faint)")}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="field-label">Kérdés szövege (űrlap)</label>
                  <Input value={q.label} maxLength={LABEL_MAX} onChange={(e) => patch(i, { label: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Kérdés szövege (telefon), üresen az űrlap szövege hangzik el</label>
                  <Input value={q.phoneLabel ?? ""} maxLength={LABEL_MAX} onChange={(e) => patch(i, { phoneLabel: e.target.value || undefined })} />
                </div>

                <div className="flex gap-3 flex-wrap">
                  <div>
                    <label className="field-label">Válasz típusa</label>
                    <select
                      value={q.type ?? "text"}
                      onChange={(e) => patch(i, { type: e.target.value === "text" ? undefined : (e.target.value as QualificationQuestion["type"]) })}
                      className="h-8 rounded-lg border px-2 text-sm"
                      style={{ border: "1px solid var(--line-soft)", background: "var(--bg-panel)", color: "var(--fg)" }}
                    >
                      {ANSWER_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Ág</label>
                    <select
                      value={q.branch ?? ""}
                      onChange={(e) => patch(i, { branch: (e.target.value || undefined) as QualificationQuestion["branch"] })}
                      className="h-8 rounded-lg border px-2 text-sm"
                      style={{ border: "1px solid var(--line-soft)", background: "var(--bg-panel)", color: "var(--fg)" }}
                    >
                      <option value="">mindkettő</option>
                      {BRANCHES.map((b) => (
                        <option key={b} value={b}>{BRANCH_LABELS[b] ?? b}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Célközönség</label>
                    <select
                      value={q.audience ?? ""}
                      onChange={(e) => patch(i, { audience: (e.target.value || undefined) as QualificationQuestion["audience"] })}
                      className="h-8 rounded-lg border px-2 text-sm"
                      style={{ border: "1px solid var(--line-soft)", background: "var(--bg-panel)", color: "var(--fg)" }}
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
                    <label className="field-label">Válaszlehetőségek (soronként egy)</label>
                    <Textarea
                      rows={3}
                      value={(q.options ?? []).join("\n")}
                      onChange={(e) => patch(i, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                      className="font-mono-ndt"
                    />
                  </div>
                )}

                <div className="flex gap-4 text-sm flex-wrap" style={{ color: "var(--fg-soft)" }}>
                  {/* Not choice-only: a free-text question is exactly where the
                      "egyéb" answers are meant to accumulate (raw46 D11). */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={q.allowOther ?? false} onChange={(e) => patch(i, { allowOther: e.target.checked })} />
                    Egyéb szabad szöveg engedélyezve
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={q.required ?? false} onChange={(e) => patch(i, { required: e.target.checked })} />
                    Kötelező
                  </label>
                </div>

                <div>
                  <label className="field-label">Kérdéscsoportok</label>
                  <div className="flex gap-4 text-sm flex-wrap" style={{ color: "var(--fg-soft)" }}>
                    {sets.map((s) => (
                      <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(q.sets ?? []).includes(s.key)}
                          onChange={(e) => toggleSet(i, s.key, e.target.checked)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                  {noSets && (
                    // Not "sehol nem lesz feltéve": questionsFromSettings puts a
                    // set-less question back into the discovery set, so the
                    // warning has to say what actually happens. Retiring a
                    // question is the delete button. (Vanda, #113.)
                    <p className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--amber)", marginTop: 4 }}>
                      <AlertTriangle size={12} aria-hidden="true" /> Egyik kérdéscsoportban sincs: mentés után a felmérő kérdések közé kerül. Végleges eltávolításhoz töröld.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="flex items-center gap-2"
            style={{ fontSize: 14, color: "var(--indigo)", padding: "8px 0", background: "none", border: "none", cursor: "pointer" }}
            onClick={addQuestion}
          >
            <Plus style={{ width: 14, height: 14 }} /> Kérdés hozzáadása
          </button>
        </div>

        <div>
          <label className="field-label">Termékismertető linkje</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
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
