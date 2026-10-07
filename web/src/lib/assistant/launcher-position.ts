export type Pos = { x: number; y: number };
export type Size = { w: number; h: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

/** Keep the box fully inside the viewport minus the insets. A viewport too small to fit pins to the top/left inset. */
export function clampPosition(pos: Pos, viewport: Size, size: Size, insets: Insets): Pos {
  const maxX = Math.max(insets.left, viewport.w - insets.right - size.w);
  const maxY = Math.max(insets.top, viewport.h - insets.bottom - size.h);
  return {
    x: Math.min(Math.max(pos.x, insets.left), maxX),
    y: Math.min(Math.max(pos.y, insets.top), maxY),
  };
}

/** Nearest left or right edge by box centre; y is kept. */
export function snapToEdge(pos: Pos, viewport: Size, size: Size, margin: number): Pos {
  const left = pos.x + size.w / 2 < viewport.w / 2;
  return { x: left ? margin : Math.max(margin, viewport.w - size.w - margin), y: pos.y };
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadPosition(storage: Store | null | undefined, key: string): Pos | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Pos> | null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x as number, y: v.y as number } : null;
  } catch {
    return null;
  }
}

/** Passing null clears the saved position. */
export function savePosition(storage: Store | null | undefined, key: string, pos: Pos | null): void {
  try {
    if (pos == null) (storage as Storage | undefined)?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(pos));
  } catch { /* storage unavailable */ }
}
