import { useCallback, useEffect, useRef, useState } from "react";

/** Debounced wrapper around fn: timer lives in a ref, latest fn is always called, cleared on unmount. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const call = useCallback(
    (...args: A) => {
      cancel();
      timer.current = setTimeout(() => latest.current(...args), ms);
    },
    [cancel, ms],
  );
  return [call, cancel] as const;
}

/** Boolean that turns on via trigger() and back off after ms; cleared on unmount. */
export function useTimedFlag(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const trigger = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  return [on, trigger];
}
