"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Trash2, X } from "lucide-react";
import { UI } from "@/lib/content/labels";
import { archiveContentBulk, checkContentDeletable, deleteContent, restoreContentBulk } from "@/app/actions/content";

const UNDO_MS = 5000;

interface Toast {
  text: string;
  undo?: () => void;
}

/** Bottom-centre on desktop, above the fixed bottom nav on phones. Never emoji. */
function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className="panel"
      style={{
        position: "fixed", left: "50%", transform: "translateX(-50%)",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        zIndex: 60, display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", boxShadow: "0 8px 24px -8px rgba(0,0,0,0.6)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--fg)" }}>{toast.text}</span>
      {toast.undo && (
        <button
          onClick={toast.undo}
          className="btn sm"
          style={{ color: "var(--indigo)", borderColor: "var(--indigo-line)" }}
        >
          {UI.undo}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label={UI.cancel}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-faint)", display: "flex" }}
      >
        <X style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}

export function BulkBar({
  selectedIds, onClear, onDone,
}: {
  selectedIds: number[];
  onClear: () => void;
  /** Called after a bulk action actually changed data, so the caller can clear selection + refresh. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function clearTimer() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }

  async function handleArchive() {
    setBusy(true);
    const res = await archiveContentBulk(selectedIds);
    setBusy(false);
    if (!res.ok) { setToast({ text: res.error }); return; }
    onDone();
    setToast({
      text: UI.archivedToast(res.archived.length),
      undo: async () => {
        clearTimer();
        setToast(null);
        const restored = await restoreContentBulk(res.archived);
        if (restored.ok) setToast({ text: UI.restoredToast(restored.restored.length) });
        onDone();
      },
    });
    timer.current = setTimeout(() => setToast(null), UNDO_MS);
  }

  async function handleDelete() {
    setBusy(true);
    const checks = await checkContentDeletable(selectedIds);
    const deletable = checks.filter((c) => c.deletable).map((c) => c.itemId);
    const blocked = checks.filter((c) => !c.deletable);
    setBusy(false);
    if (deletable.length === 0) {
      setToast({ text: UI.deleteBlocked });
      return;
    }
    if (blocked.length > 0) {
      window.alert(`${UI.deleteBlocked} (${blocked.length})`);
    }
    if (!window.confirm(UI.deleteConfirm(deletable.length))) return;

    let cancelled = false;
    setToast({
      text: UI.deleteConfirm(deletable.length),
      undo: () => { cancelled = true; clearTimer(); setToast(null); },
    });
    timer.current = setTimeout(async () => {
      if (cancelled) return;
      const res = await deleteContent(deletable);
      if (!res.ok) { setToast({ text: res.error }); return; }
      onDone();
      if (res.refused.length > 0) {
        setToast({ text: `${UI.deletedToast(res.deleted.length)}: ${res.refused.map((r) => r.reason).join(", ")}` });
      } else {
        setToast({ text: UI.deletedToast(res.deleted.length) });
      }
    }, UNDO_MS);
  }

  return (
    <>
      {toast && <ToastView toast={toast} onDismiss={() => { clearTimer(); setToast(null); }} />}
      {selectedIds.length > 0 && (
        <div
          className="panel"
          style={{
            position: "sticky", bottom: 0, zIndex: 40,
            marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "10px 16px",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{UI.selectedCount(selectedIds.length)}</span>
          <button onClick={onClear} className="btn ghost sm">
            <X style={{ width: 14, height: 14 }} />
            {UI.clearSelection}
          </button>
          <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
            <button onClick={handleArchive} disabled={busy} className="btn sm">
              <Archive style={{ width: 14, height: 14 }} />
              {UI.archiveSelected}
            </button>
            <button
              onClick={handleDelete} disabled={busy} className="btn sm"
              style={{ color: "var(--coral)", borderColor: "var(--coral-soft)" }}
            >
              <Trash2 style={{ width: 14, height: 14 }} />
              {UI.deleteSelected}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
