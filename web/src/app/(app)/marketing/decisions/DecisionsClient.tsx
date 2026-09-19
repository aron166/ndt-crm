"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/content/labels";
import type { DecisionQueue, DecisionRow } from "@/lib/content/queries";
import { setContentCheck } from "@/app/actions/content";

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
  const inputId = `decision-answer-${row.checkId}`;

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
      className="panel-pad"
      style={{ borderBottom: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge-ds slate">{sourceLabel(row.source)}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: urgent ? "var(--coral)" : "var(--fg-mute)" }}>
          {UI.decisionsWaited(row.daysWaiting)}
        </span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", lineHeight: 1.4 }}>
        {row.question}
      </div>

      <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>
        {UI.decisionsBlocks}{" "}
        <Link href={`/marketing/${row.item.id}`} style={{ color: "var(--fg-mute)" }}>
          {row.item.title}
        </Link>
      </div>

      {/* A rule check is code, not prose: setCheckState refuses to settle one by
          hand (it is cleared only by a new version that passes the rule), so
          offering an answer box here would be a button that can only 403. */}
      {row.source === "rule" ? (
        <p style={{ fontSize: 12, color: "var(--fg-mute)", margin: 0 }}>{UI.decisionsRuleReadOnly}</p>
      ) : (
      <>
      <textarea
        id={inputId}
        aria-label={row.question}
        placeholder={UI.decisionsAnswerPlaceholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        style={{
          width: "100%", background: "var(--bg-raised)", border: "1px solid var(--line-soft)",
          borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "var(--fg)", resize: "vertical",
        }}
      />

      {error && <p style={{ fontSize: 12, color: "var(--coral)" }}>{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => submit("resolved")}
          style={{
            minHeight: 32, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500,
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
            background: "var(--mint-soft)", color: "var(--mint)", border: "1px solid var(--mint)",
          }}
        >
          {UI.checkResolve}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => submit("waived")}
          style={{
            minHeight: 32, padding: "0 12px", borderRadius: 6, fontSize: 13, fontWeight: 500,
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
            background: "var(--bg-raised)", color: "var(--fg-mute)", border: "1px solid var(--line-soft)",
          }}
        >
          {UI.checkWaive}
        </button>
      </div>
      </>
      )}
    </li>
  );
}

function Group({ title, rows }: { title: string; rows: DecisionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section style={{ marginBottom: 24 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>{title}</h2>
        <span className="badge-ds" style={{ color: "var(--fg-mute)" }}>{UI.decisionsOpenCount(rows.length)}</span>
      </div>
      <ul className="panel" style={{ listStyle: "none", margin: 0, padding: 0 }}>
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
      <div className="panel">
        <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
          {UI.decisionsEmpty}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Group title={UI.decisionsGroupAron} rows={queue.aron} />
      <Group title={UI.decisionsGroupPeter} rows={queue.peter} />
      <Group title={UI.decisionsGroupEither} rows={queue.either} />
    </div>
  );
}
