"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/content/labels";
import { A } from "@/lib/assistant/labels";
import type { DecisionQueue, DecisionRow } from "@/lib/content/queries";
import { setContentCheck } from "@/app/actions/content";
import k from "@/components/astryx/page.module.css";
import s from "../marketing.module.css";

const SOURCE_LABEL: Record<string, string> = {
  rule: UI.decisionsFromRule,
  decision: UI.decisionsFromDecision,
  import: UI.decisionsFromImport,
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? UI.decisionsFromManual;
}

function Row({ row }: { row: DecisionRow }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = isPending || text.trim().length < 2;
  const urgent = row.daysWaiting > 3;

  function submit(state: "resolved" | "waived") {
    setError(null);
    startTransition(async () => {
      const res = await setContentCheck({ checkId: row.checkId, state, text: text.trim() });
      if (!res.ok) { setError(res.error); return; }
      setText("");
      router.refresh();
    });
  }

  return (
    <li
      id={String(row.checkId)}
      className={k.row}
      data-u={urgent ? "overdue" : undefined}
      style={{ scrollMarginTop: 80, alignItems: "start" }}
    >
      <span className={k.bar} />
      <div className={k.cell}>
        <div className={k.nameLine}>
          <span className="badge-ds slate">{sourceLabel(row.source)}</span>
        </div>
        <div className={k.strong} style={{ lineHeight: 1.4 }}>
          {row.question}
        </div>
        <div className={k.muted}>
          {UI.decisionsBlocks}{" "}
          <Link href={`/marketing/${row.item.id}`} className={k.link}>
            {row.item.title}
          </Link>
        </div>
      </div>

      <div className={k.cell}>
        <textarea
          aria-label={row.question}
          placeholder={UI.decisionsAnswerPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className={s.field}
          style={{ width: "100%", resize: "vertical" }}
        />
        {error && <p className={k.muted} style={{ color: "var(--coral)", margin: 0 }}>{error}</p>}
      </div>

      <div className={k.cell}>
        <span className={k.muted} style={urgent ? { color: "var(--coral)", fontWeight: 500 } : undefined}>
          {UI.decisionsWaited(row.daysWaiting)}
        </span>
      </div>

      <div className={k.cellEnd} style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => submit("resolved")}
          className={`${k.btn} ${k.btnPrimary}`}
        >
          {UI.checkResolve}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => submit("waived")}
          className={k.btn}
        >
          {UI.checkWaive}
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("assistant:focus", { detail: { itemId: row.item.id } }))}
          className={k.btn}
        >
          {A.askAbout}
        </button>
      </div>
    </li>
  );
}

function Group({ title, rows }: { title: string; rows: DecisionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className={k.group}>
      <div className={k.groupHead}>
        <h2 className={k.groupTitle}>{title}</h2>
        <span className="badge-ds" style={{ color: "var(--color-text-secondary)" }}>{UI.decisionsOpenCount(rows.length)}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((row) => (
          <Row key={row.checkId} row={row} />
        ))}
      </ul>
    </section>
  );
}

export function DecisionsClient({ queue }: { queue: DecisionQueue }) {
  if (queue.total === 0) {
    return (
      <div className={`${k.empty} ${s.emptyC}`}>{UI.decisionsEmpty}</div>
    );
  }

  return (
    <div>
      {queue.truncated && (
        <p className={k.muted} style={{ marginBottom: 16 }}>{UI.decisionsTruncated}</p>
      )}
      <Group title={UI.decisionsGroupAron} rows={queue.aron} />
      <Group title={UI.decisionsGroupPeter} rows={queue.peter} />
      <Group title={UI.decisionsGroupEither} rows={queue.either} />
    </div>
  );
}
