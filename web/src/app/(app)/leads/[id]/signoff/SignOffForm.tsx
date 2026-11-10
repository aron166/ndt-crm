"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { signOffLeadAction } from "@/app/actions/documents";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const fieldClass = "min-h-12 text-lg"; // tablet signer: bigger touch targets
const label: React.CSSProperties = { display: "block", fontSize: 16, fontWeight: 600, marginBottom: 6 };

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
  const last = useRef({ x: 0, y: 0 });

  const ink = useRef(0); // stroke length drawn, in CSS px: a tap is not a signature
  const [resized, setResized] = useState(false);

  // Size the backing store to the CSS size times devicePixelRatio, and again on every
  // resize or rotation (Vanda #B4). A resized canvas cannot keep its strokes aligned,
  // so it is cleared and the signer is asked to sign again.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let first = true;
    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#000";
      if (!first && ink.current > 0) setResized(true);
      first = false;
      ink.current = 0;
      setHasSig(false);
    };
    size();
    const ro = new ResizeObserver(() => size());
    ro.observe(c);
    return () => ro.disconnect();
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
    ctx.beginPath(); ctx.moveTo(x, y);
    last.current = { x, y };
    setResized(false);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    ink.current += Math.hypot(x - last.current.x, y - last.current.y);
    last.current = { x, y };
    if (ink.current > 40) setHasSig(true);
  }
  function up() { drawing.current = false; }
  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.clientWidth, c.clientHeight);
    ink.current = 0;
    setHasSig(false);
  }

  // A scope change needs its text AND a real new price: an empty price must not go out as 0 Ft.
  const netOk = !change || (changeText.trim().length >= 3 && newNet.trim() !== "" && Number.isFinite(Number(newNet)) && Number(newNet) >= 0);
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
          <a href={`/leads/${leadId}/documents/${done.id}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>PDF</a>
          <Link href={`/leads/${leadId}`} className={buttonVariants({ variant: "outline", size: "lg" })}>Vissza a laphoz</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        {/* PROPOSAL copy */}
        <label htmlFor="so-name" style={label}>Aláíró neve</label>
        <Input id="so-name" className={fieldClass} value={signerName} onChange={(e) => setSignerName(e.target.value)} autoComplete="off" />
      </div>
      <div>
        {/* PROPOSAL copy */}
        <label htmlFor="so-scope" style={label}>Elvégzett munka</label>
        <Textarea id="so-scope" rows={5} className={fieldClass} value={doneScope} onChange={(e) => setDoneScope(e.target.value)} />
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
            <Input id="so-change-text" className={fieldClass} value={changeText} onChange={(e) => setChangeText(e.target.value)} />
            {/* PROPOSAL copy */}
            <label htmlFor="so-net" style={label}>Új nettó ár (Ft)</label>
            <Input id="so-net" type="number" inputMode="numeric" min={0} step={1} className={fieldClass} value={newNet} onChange={(e) => setNewNet(e.target.value)} />
          </div>
        )}
      </div>
      <div>
        {/* PROPOSAL copy */}
        <p id="so-sig-help" style={label}>Kérjük, írja alá a keretben</p>
        {/* PROPOSAL copy */}
        {resized && <p role="status" style={{ fontSize: 16, color: "var(--ui-warning-text)", marginBottom: 6 }}>A képernyő elfordult: kérjük, írja alá újra.</p>}
        <canvas
          ref={canvas}
          aria-label="Aláírás" // PROPOSAL copy
          aria-describedby="so-sig-help"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ width: "100%", height: 220, background: "#fff", border: "2px solid var(--ui-border-strong)", borderRadius: "var(--ui-radius-control)", touchAction: "none", display: "block" }}
        />
        {/* PROPOSAL copy */}
        <Button type="button" variant="outline" size="lg" onClick={clear} className="mt-2">Törlés</Button>
      </div>
      {error && <p role="alert" style={{ fontSize: 18, color: "var(--ui-danger-text)", margin: 0 }}>{error}</p>}
      {/* PROPOSAL copy */}
      <Button type="submit" size="lg" disabled={!canSubmit} className="min-h-14">
        Aláírás és teljesítésigazolás
      </Button>
    </form>
  );
}
