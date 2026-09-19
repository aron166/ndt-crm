/**
 * Text colour for a chip whose colour comes from the database.
 *
 * Lead statuses, pipeline stages and tags store a hex the user picked from a
 * swatch list that was tuned against the dark panel. Several of those swatches
 * are around 2:1 on white (#f59e0b, #22c55e, #06b6d4), which makes the chip
 * label effectively invisible in light mode. `--data-ink-mix` is 0% in dark
 * (use the stored colour exactly as before) and 100% in light (fall all the
 * way back to --fg). The dot and the border keep the stored hue either way,
 * so the status is still identifiable by colour.
 */
export function dataInk(color: string): string {
  return `color-mix(in oklab, ${color}, var(--fg) var(--data-ink-mix))`;
}
