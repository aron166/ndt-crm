import { useCallback, useEffect, useRef } from "react";

export const DEFER_MS = 6000;

/**
 * Deferred commit for append-only writes: schedule() starts a timer, cancel() (Undo)
 * drops it before anything is sent, flush() sends now. The page being hidden or left
 * (visibilitychange / pagehide / unmount) flushes, so a click is never lost.
 * One pending item at a time: the same key again is ignored, a different key flushes the old one first.
 */
export function useDeferredCall<T>(commit: (item: T) => void, delay = DEFER_MS) {
  const pending = useRef<{ key: string; item: T; timer: ReturnType<typeof setTimeout> } | null>(null);
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    commitRef.current(p.item);
  }, []);

  const cancel = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  const schedule = useCallback((key: string, item: T) => {
    if (pending.current?.key === key) return false;
    flush();
    pending.current = { key, item, timer: setTimeout(flush, delay) };
    return true;
  }, [flush, delay]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return { schedule, cancel, flush };
}
