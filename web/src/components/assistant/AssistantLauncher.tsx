"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { A } from "@/lib/assistant/labels";

const AssistantDrawer = dynamic(() => import("./AssistantDrawer").then((m) => m.AssistantDrawer), { ssr: false });

const ITEM_RE = /^\/marketing\/(\d+)$/;

export function AssistantLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focus, setFocus] = useState<{ id: number; path: string } | null>(null);

  const m = ITEM_RE.exec(pathname);
  // An explicit focus only holds on the page it was raised on.
  const itemId = focus && focus.path === pathname ? focus.id : m ? Number(m[1]) : null;

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

  return (
    <>
      <style>{`
        .assistant-launcher { position: fixed; right: 16px; bottom: 16px; z-index: 30; }
        @media (max-width: 767px) {
          /* clear the fixed review action bar (about 64px plus safe area) */
          .assistant-launcher { bottom: calc(80px + env(safe-area-inset-bottom)); right: 12px; }
        }
      `}</style>
      <button
        type="button"
        className="assistant-launcher"
        onClick={show}
        style={{
          minHeight: 36, padding: "0 14px", borderRadius: 18, fontSize: 13, fontWeight: 500, cursor: "pointer",
          background: "var(--bg-raised)", color: "var(--fg)", border: "1px solid var(--line-soft)",
        }}
      >
        {A.launcher}
      </button>
      {/* key: a new item in view starts a new conversation, answers about item A never carry into item B. */}
      {mounted && <AssistantDrawer key={itemId ?? "none"} open={open} itemId={itemId} onClose={() => setOpen(false)} />}
    </>
  );
}
