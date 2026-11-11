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
    act(() => { result.current.schedule("a", "x"); result.current.cancel("a"); });
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

  it("second outcome flushes the first; Undo on the first then returns false", () => {
    const commit = vi.fn();
    const dismissA = vi.fn();
    const { result } = renderHook(() => useDeferredCall<string>(commit));
    act(() => { result.current.schedule("a", "x"); result.current.bindDismiss("a", dismissA); });
    act(() => { result.current.schedule("b", "y"); });
    expect(dismissA).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledExactlyOnceWith("x");
    let undone = true;
    act(() => { undone = result.current.cancel("a"); });
    expect(undone).toBe(false);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("Undo after the timer flush returns false and commits once; before it returns true", () => {
    const commit = vi.fn();
    const dismiss = vi.fn();
    const { result } = renderHook(() => useDeferredCall<string>(commit));
    act(() => { result.current.schedule("a", "x"); result.current.bindDismiss("a", dismiss); });
    act(() => { vi.advanceTimersByTime(6000); });
    expect(dismiss).toHaveBeenCalledTimes(1);
    let undone = true;
    act(() => { undone = result.current.cancel("a"); });
    expect(undone).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
    act(() => { result.current.schedule("b", "y"); });
    act(() => { undone = result.current.cancel("b"); });
    expect(undone).toBe(true);
  });
});
