"use client";

import { useState, useTransition } from "react";
import { approveNurtureTemplateAction } from "@/app/actions/nurture";

// PROPOSAL copy: Jóváhagyom / Jóváhagyás visszavonása
export function ApproveButton({ templateId, approved }: { templateId: number; approved: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className={approved ? "btn sm" : "btn sm primary"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await approveNurtureTemplateAction(templateId, !approved);
            setErr("error" in r ? r.error : null);
          })
        }
      >
        {approved ? "Jóváhagyás visszavonása" : "Jóváhagyom"}
      </button>
      {err && <span role="alert" style={{ color: "var(--coral)", fontSize: 12, marginLeft: 8 }}>{err}</span>}
    </span>
  );
}
