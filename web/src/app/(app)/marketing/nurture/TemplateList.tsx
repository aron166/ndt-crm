"use client";

import { useState } from "react";
import { ApproveButton } from "./ApproveButton";

export interface TemplateRow {
  id: number;
  key: string;
  subject: string;
  preview: string | null;
  status: string;
  approvedAt: string | null;
  html: string;
  text: string;
}

// PROPOSAL copy: all Hungarian labels below
function Row({ t, canApprove }: { t: TemplateRow; canApprove: boolean }) {
  const [open, setOpen] = useState(false);
  const approved = t.status === "approved";
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid var(--ui-border)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <strong style={{ fontSize: 14 }}>{t.subject}</strong>
        <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--ui-text-muted)" }}>{t.key}</span>
        <span className="badge-ds" style={{ color: approved ? "var(--ui-accent)" : "var(--ui-text-muted)" }}>
          {approved ? "jóváhagyva" : t.status === "retired" ? "visszavonva" : "javaslat"}
        </span>
        {t.approvedAt && <span style={{ fontSize: 12, color: "var(--ui-text-muted)" }}>{t.approvedAt}</span>}
      </div>
      {t.preview && <p style={{ fontSize: 13, color: "var(--ui-text-muted)", margin: "4px 0 0" }}>{t.preview}</p>}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8 }}>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(!open)}>
          {open ? "Előnézet elrejtése" : "Előnézet"}
        </button>
        {canApprove && <ApproveButton templateId={t.id} approved={approved} />}
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <iframe
            title={t.key}
            sandbox=""
            srcDoc={t.html}
            style={{ width: "100%", height: 360, border: "1px solid var(--ui-border)", borderRadius: 6, background: "#fff" /* design-allow: email preview mimics a mail client */ }}
          />
          <pre className="font-mono-ndt" style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ui-text-muted)", marginTop: 8 }}>
            {t.text}
          </pre>
        </div>
      )}
    </div>
  );
}

export function TemplateList({ rows, canApprove }: { rows: TemplateRow[]; canApprove: boolean }) {
  return <>{rows.map((t) => <Row key={t.id} t={t} canApprove={canApprove} />)}</>;
}
