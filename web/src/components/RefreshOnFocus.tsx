"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetch the current route when the tab comes back to the foreground.
 *
 * Agents post content through the API while Áron and Péter have the board
 * open. Those pages are `force-dynamic`, so a FRESH request always carries the
 * new item — but nothing pushes to a tab that is already open, and Next's
 * client Router Cache can hand back the payload it already holds. Twice
 * (items 17 and 18, 2026-09-19) an item was reported "missing" that prod was
 * serving correctly on a cold request.
 *
 * Server-side revalidation cannot fix this: `force-dynamic` leaves no cache
 * entry to bust, and `revalidatePath` reaches no browser. The client has to
 * ask again, so it asks whenever a human looks back at the tab.
 *
 * ponytail: focus/visibility only, no polling — a tab nobody is looking at
 * does not need to be current. Add an interval only if someone watches the
 * board while work lands in another window.
 */

/** Refuse to re-fetch more often than this: alt-tabbing is not a refresh button. */
export const REFRESH_MIN_INTERVAL_MS = 10_000;

/** Exported for the test: the throttle is the only real logic here. */
export function shouldRefresh(lastAt: number, now: number, visible: boolean): boolean {
  return visible && now - lastAt >= REFRESH_MIN_INTERVAL_MS;
}

/**
 * True while someone has prose in flight that a re-render could disturb
 * (Kai, 2026-09-19: a refresh must never eat what Áron or Péter is typing).
 *
 * A non-empty <textarea> IS the unsaved-input signal in this app: every prose
 * surface is one — the review comment, the change note, the editor, the
 * Döntések answer box — while <input> is filters, checkboxes and search,
 * which are cheap to lose and usually mirrored in the URL anyway. A focused
 * text field counts too, because someone mid-keystroke is mid-thought.
 *
 * ponytail: a DOM read, not a form registry. A registry would mean every
 * form opting in, and the one that forgets is the one that loses the text.
 *
 * Known, accepted gap: text typed into an <input> on the review page
 * (publish URL, metrics, outreach slot, change note) is NOT protected once
 * that input loses focus, because ReviewClient is keyed on currentVersionId
 * and remounts when a refresh brings a new version. Deliberately not fixed
 * by also scanning unfocused inputs the way textareas are scanned: those
 * fields are pre-filled from server data, so a non-empty scan would mean the
 * review page never refreshes at all. The realistic sequence (type, alt-tab,
 * return) IS covered, because the browser keeps the input as activeElement
 * across a tab switch.
 */
/**
 * Input types that hold TYPED TEXT. A checkbox, radio or button is not
 * unsaved prose — and blocking on one would defeat the whole feature: on
 * /marketing the only <input>s are the bulk-select checkboxes (the filters
 * are <select>), and a browser leaves a ticked checkbox as activeElement, so
 * "tick a card, alt-tab, come back" would never refresh (Vanda F7).
 * `""` is in the set on purpose: `<input>` with no type attribute is text.
 */
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number", ""]);

function isTextInput(el: Element | null): el is HTMLInputElement {
  return el?.tagName === "INPUT" && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
}

export function hasUnsavedInput(doc: Document = document): boolean {
  const active = doc.activeElement as HTMLElement | null;
  if (active?.isContentEditable) return true;
  if (active?.tagName === "TEXTAREA" || isTextInput(active)) return true;
  for (const ta of doc.querySelectorAll("textarea")) {
    if (ta.value.trim() !== "") return true;
  }
  return false;
}

export function RefreshOnFocus() {
  const router = useRouter();
  const lastAt = useRef(0);

  useEffect(() => {
    // Seeded with "now" on mount, not at render time: the page just
    // rendered on the server, so it is already current — a focus event one
    // second later has nothing to fetch. (`Date.now()` is an impure call,
    // so it belongs in the effect, not in the useRef initializer.)
    lastAt.current = Date.now();
    function maybeRefresh() {
      const now = Date.now();
      if (!shouldRefresh(lastAt.current, now, document.visibilityState === "visible")) return;
      // Deliberately does NOT advance lastAt: once the text is saved or
      // cleared, the next focus should refresh straight away rather than
      // serve a stale board for another throttle window.
      if (hasUnsavedInput()) return;
      lastAt.current = now;
      router.refresh();
    }
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [router]);

  return null;
}
