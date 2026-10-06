"use client";

import { useRef, useState, useTransition } from "react";
import { addSuppression } from "@/app/actions/suppressions";

const input = { width: "100%", padding: "6px 10px", fontSize: 14, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg)", outline: "none" } as const;
const label = { fontSize: 12, color: "var(--fg-mute)", display: "block", marginBottom: 4 } as const;

export function SuppressionForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await addSuppression(fd);
      if ("error" in res && res.error) setError(res.error);
      else ref.current?.reset();
    });
  }

  return (
    <form ref={ref} action={submit} className="panel-pad space-y-3">
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
        <div>
          <label style={label} htmlFor="sup-target">Email cím vagy domain</label>
          <input id="sup-target" name="target" required placeholder="nev@ceg.hu vagy ceg.hu" style={input} />
        </div>
        <div>
          <label style={label} htmlFor="sup-date">Kérés dátuma</label>
          <input id="sup-date" name="requestedAt" type="date" required style={input} />
        </div>
        <div>
          <label style={label} htmlFor="sup-channel">Csatorna</label>
          <select id="sup-channel" name="channel" defaultValue="" style={input}>
            <option value="">-</option>
            <option value="email">Email</option>
            <option value="phone">Telefon</option>
            <option value="linkedin">LinkedIn</option>
            <option value="in_person">Személyesen</option>
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
        <div>
          <label style={label} htmlFor="sup-source">Forrás</label>
          <input id="sup-source" name="source" maxLength={200} style={input} />
        </div>
        <div>
          <label style={label} htmlFor="sup-note">Megjegyzés</label>
          <input id="sup-note" name="note" maxLength={1000} style={input} />
        </div>
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: "var(--rose, #e5484d)" }}>{error}</div>}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn primary">Hozzáadás</button>
      </div>
    </form>
  );
}
