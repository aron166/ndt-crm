"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { signOffLeadAction } from "@/app/actions/documents";

const field: React.CSSProperties = {
  width: "100%", minHeight: 48, padding: "10px 12px", fontSize: 18,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 8, color: "var(--fg)",
};
const label: React.CSSProperties = { display: "block", fontSize: 16, fontWeight: 600, marginBottom: 6 };
const btn: React.CSSProperties = { minHeight: 48, padding: "0 20px", fontSize: 18, borderRadius: 8, cursor: "pointer" };

export function SignOffForm({ leadId }: { leadId: number }) {
  const [signerName, setSignerName] = useState("");
  const [doneScope, setDoneScope] = useState("");
  const [change, setChange] = useState(false);
  const [changeText, setChangeText] = useState("");
  const [newNet, setNewNet] = useState("");
  const [hasSig, setHasSig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; number: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Size the backing store to the CSS size times devicePixelRatio.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#000";
  }, [done]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); ctx.stroke();
    setHasSig(true);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
  }
  function up() { drawing.current = false; }
  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.clientWidth, c.clientHeight);
    setHasSig(false);
  }

  const netOk = !change || newNet === "" || Number.isFinite(Number(newNet));
  const canSubmit = signerName.trim() !== "" && doneScope.trim() !== "" && hasSig && netOk && !pending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const signature = canvas.current!.toDataURL("image/png");
    startTransition(async () => {
      const res = await signOffLeadAction(leadId, {
        signerName: signerName.trim(),
        signature,
        doneScope: doneScope.trim(),
        scopeChange: change && changeText.trim() ? { text: changeText.trim(), newNetHuf: Number(newNet) } : null,
      });
      if ("error" in res && res.error) { setError(res.error); return; }
      if ("success" in res && res.success) setDone({ id: res.documentId, number: res.number });
    });
  }

  if (done) {
    return (
      <div className="card" style={{ padding: 20, fontSize: 20 }}>
        {/* PROPOSAL copy */}
        <p style={{ fontWeight: 600, margin: "0 0 16px" }}>Kész: {done.number}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a href={`/leads/${leadId}/documents/${done.id}/pdf`} target="_blank" rel="noreferrer" className="row-link" style={{ ...btn, display: "inline-flex", alignItems: "center", border: "1px solid var(--line-soft)" }}>PDF</a>
          <Link href={`/leads/${leadId}`} className="row-link" style={{ ...btn, display: "inline-flex", alignItems: "center", border: "1px solid var(--line-soft)" }}>Vissza a laphoz</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        {/* PROPOSAL copy */}
        <label htmlFor="so-name" style={label}>Aláíró neve</label>
        <input id="so-name" style={field} value={signerName} onChange={(e) => setSignerName(e.target.value)} autoComplete="off" />
      </div>
      <div>
        {/* PROPOSAL copy */}
        <label htmlFor="so-scope" style={label}>Elvégzett munka</label>
        <textarea id="so-scope" rows={5} style={field} value={doneScope} onChange={(e) => setDoneScope(e.target.value)} />
      </div>
      <div>
        <label htmlFor="so-change" style={{ ...label, display: "flex", alignItems: "center", gap: 12, minHeight: 48 }}>
          <input id="so-change" type="checkbox" checked={change} onChange={(e) => setChange(e.target.checked)} style={{ width: 28, height: 28 }} />
          {/* PROPOSAL copy */}
          Helyszíni módosítás
        </label>
        {change && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* PROPOSAL copy */}
            <label htmlFor="so-change-text" style={label}>Módosítás leírása</label>
            <input id="so-change-text" style={field} value={changeText} onChange={(e) => setChangeText(e.target.value)} />
            {/* PROPOSAL copy */}
            <label htmlFor="so-net" style={label}>Új nettó ár (Ft)</label>
            <input id="so-net" type="number" inputMode="numeric" min={0} step={1} style={field} value={newNet} onChange={(e) => setNewNet(e.target.value)} />
          </div>
        )}
      </div>
      <div>
        {/* PROPOSAL copy */}
        <p id="so-sig-help" style={label}>Kérjük, írja alá a keretben</p>
        <canvas
          ref={canvas}
          aria-label="Aláírás" // PROPOSAL copy
          aria-describedby="so-sig-help"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ width: "100%", height: 220, background: "#fff", border: "2px solid var(--line-soft)", borderRadius: 8, touchAction: "none", display: "block" }}
        />
        {/* PROPOSAL copy */}
        <button type="button" onClick={clear} style={{ ...btn, marginTop: 8, border: "1px solid var(--line-soft)", background: "transparent", color: "var(--fg)" }}>Törlés</button>
      </div>
      {error && <p role="alert" style={{ fontSize: 18, color: "var(--coral)", margin: 0 }}>{error}</p>}
      {/* PROPOSAL copy */}
      <button type="submit" disabled={!canSubmit} style={{ ...btn, minHeight: 56, fontWeight: 600, background: "#4f46e5", color: "#fff", border: "none", opacity: canSubmit ? 1 : 0.5 }}>
        Aláírás és teljesítésigazolás
      </button>
    </form>
  );
}
