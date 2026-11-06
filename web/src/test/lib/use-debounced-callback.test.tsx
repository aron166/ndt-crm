import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedCallback, useTimedFlag } from "@/lib/use-debounced-callback";

describe("useDebouncedCallback", () => {
  it("fires once with the last args, and not after unmount", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => { result.current[0]("a"); result.current[0]("b"); });
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
    act(() => result.current[0]("c"));
    unmount();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("useTimedFlag", () => {
  it("turns on then off after ms", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimedFlag(500));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current[0]).toBe(false);
    vi.useRealTimers();
  });
});
