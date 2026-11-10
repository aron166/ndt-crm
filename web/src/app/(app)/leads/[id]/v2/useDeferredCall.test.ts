import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDeferredCall } from "./useDeferredCall";

describe("useDeferredCall", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("commits after 6 s", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDeferredCall<string>(commit));
    act(() => { result.current.schedule("a", "x"); });
    act(() => { vi.advanceTimersByTime(5999); });
    expect(commit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(commit).toHaveBeenCalledExactlyOnceWith("x");
  });

  it("undo cancels", () => {
    const commit = vi.fn();
    const { result, unmount } = renderHook(() => useDeferredCall<string>(commit));
    act(() => { result.current.schedule("a", "x"); result.current.cancel(); });
    act(() => { vi.advanceTimersByTime(10000); });
    unmount();
    expect(commit).not.toHaveBeenCalled();
  });

  it("page hide flushes once", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDeferredCall<string>(commit));
    act(() => { result.current.schedule("a", "x"); });
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pagehide"));
      vi.advanceTimersByTime(10000);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("double click does not commit twice", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDeferredCall<string>(commit));
    act(() => { result.current.schedule("a", "x"); result.current.schedule("a", "x"); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
