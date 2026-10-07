"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { A } from "@/lib/assistant/labels";
import { clampPosition, loadPosition, savePosition, snapToEdge, type Pos } from "@/lib/assistant/launcher-position";

const AssistantDrawer = dynamic(() => import("./AssistantDrawer").then((m) => m.AssistantDrawer), { ssr: false });

const ITEM_RE = /^\/marketing\/(\d+)$/;

const MARGIN = 12;
const PULSE_KEY = "assistant.launcher.pulsed";

function insets() {
  const phone = window.matchMedia("(max-width: 767px)").matches;
  // top bar is 60px; phones have no status bar but a fixed review action bar (80px rule)
  return { top: 60, left: MARGIN, right: MARGIN, bottom: phone ? 80 : 26 + MARGIN };
}

export function AssistantLauncher({ userId, pending }: { userId: number | null; pending: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pulse, setPulse] = useState(false);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const key = `assistant.launcher.${userId ?? "anon"}`;
  const [focus, setFocus] = useState<{ id: number; path: string } | null>(null);

  const m = ITEM_RE.exec(pathname);
  // An explicit focus only holds on the page it was raised on.
  const itemId = focus && focus.path === pathname ? focus.id : m ? Number(m[1]) : null;

  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => { setMounted(true); setOpen(true); }, []);

  useEffect(() => {
    function onFocus(e: Event) {
      const id = (e as CustomEvent<{ itemId?: number }>).detail?.itemId;
      if (typeof id === "number") setFocus({ id, path: window.location.pathname });
      show();
    }
    window.addEventListener("assistant:focus", onFocus);
    return () => window.removeEventListener("assistant:focus", onFocus);
  }, [show]);

  const fit = useCallback((p: Pos, snap: boolean): Pos => {
    const r = btnRef.current?.getBoundingClientRect();
    const size = { w: r?.width ?? 44, h: r?.height ?? 44 };
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const c = clampPosition(p, vp, size, insets());
    return snap ? clampPosition(snapToEdge(c, vp, size, MARGIN), vp, size, insets()) : c;
  }, []);

  // Restore the saved spot and re-fit it on resize.
  useEffect(() => {
    let saved: Pos | null = null;
    try { saved = loadPosition(window.localStorage, key); } catch { /* storage unavailable */ }
    const r = requestAnimationFrame(() => setPos(saved ? fit(saved, true) : null));
    const onResize = () => setPos((p) => (p ? fit(p, true) : p));
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(r); window.removeEventListener("resize", onResize); };
  }, [key, fit]);

  // One subtle pulse per browser session, only when something waits.
  useEffect(() => {
    if (pending <= 0) return;
    const r = requestAnimationFrame(() => {
      try {
        if (window.sessionStorage.getItem(PULSE_KEY)) return;
        window.sessionStorage.setItem(PULSE_KEY, "1");
      } catch { /* storage unavailable: pulse anyway */ }
      setPulse(true);
    });
    return () => cancelAnimationFrame(r);
  }, [pending]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    suppressClick.current = false; // a drag that produced no click must not swallow the next tap
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    setPos(fit({ x: d.ox + dx, y: d.oy + dy }, false));
  }
  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.moved) return;
    suppressClick.current = true; // the click that follows a drag is not an open
    setTimeout(() => { suppressClick.current = false; }, 0); // touch drags and cancels fire no click
    setDragging(false);
    const r = e.currentTarget.getBoundingClientRect();
    const next = fit({ x: r.left, y: r.top }, true);
    setPos(next);
    try { savePosition(window.localStorage, key, next); } catch { /* storage unavailable */ }
  }
  function onClick() {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setPulse(false);
    setFocus(null);
    show();
  }
  // Resets the spot only; the drawer state is left to the clicks.
  function resetPosition() {
    setPos(null);
    try { savePosition(window.localStorage, key, null); } catch { /* storage unavailable */ }
  }

  return (
    <>
      <style>{`
        .assistant-launcher { position: fixed; z-index: 30; right: 16px; bottom: calc(var(--statusbar-h, 26px) + 12px + env(safe-area-inset-bottom));
          min-height: 44px; min-width: 44px; padding: 0 14px; border-radius: 22px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          font-size: 14px; font-weight: 500; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
          background: var(--bg-raised); color: var(--fg); border: 1px solid var(--line); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18); }
        .assistant-launcher[data-placed="true"] { right: auto; bottom: auto; transition: left 200ms ease, top 200ms ease; }
        .assistant-launcher[data-dragging="true"] { transition: none; cursor: grabbing; }
        .assistant-launcher:hover { border-color: var(--mint-line); }
        .assistant-launcher-label { display: none; }
        .assistant-launcher-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center;
          background: var(--mint); color: var(--fg-on-accent); }
        .assistant-launcher[data-pulse="true"] { animation: assistantPulse 1.6s ease-out 2; }
        @keyframes assistantPulse { 0% { box-shadow: 0 0 0 0 var(--mint-glow, rgba(80, 200, 160, 0.4)); } 100% { box-shadow: 0 0 0 14px transparent; } }
        @media (min-width: 768px) { .assistant-launcher-label { display: inline; } }
        @media (max-width: 767px) {
          /* clear the fixed review action bar (about 64px plus safe area) */
          .assistant-launcher { bottom: calc(80px + env(safe-area-inset-bottom)); right: 12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .assistant-launcher, .assistant-launcher[data-placed="true"] { transition: none; animation: none; }
          .assistant-launcher[data-pulse="true"] { animation: none; }
        }
      `}</style>
      <button
        ref={btnRef}
        type="button"
        className="assistant-launcher"
        aria-label={pending > 0 ? `${A.launcher}, ${A.pendingBadge(pending)}` : A.launcher}
        data-placed={pos ? "true" : undefined}
        data-dragging={dragging ? "true" : undefined}
        data-pulse={pulse ? "true" : undefined}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        onDoubleClick={resetPosition}
      >
        <MessageSquare size={18} aria-hidden="true" />
        <span className="assistant-launcher-label">{A.launcher}</span>
        {pending > 0 && <span className="assistant-launcher-badge" aria-hidden="true">{pending > 99 ? "99+" : pending}</span>}
      </button>
      {/* No key: the drawer stays mounted across page changes so a chat survives navigation. */}
      {mounted && <AssistantDrawer open={open} pathname={pathname} itemId={itemId} onClose={close} />}
    </>
  );
}
