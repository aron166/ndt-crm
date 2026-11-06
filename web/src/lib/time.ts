/** The one Budapest clock. No imports: safe for client components. */
export const TZ = "Europe/Budapest";

/** yyyy-mm-dd of `d` in Budapest. */
export const budapestYmd = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** Budapest wall-clock hour (0-23) and short English weekday ("Mon".."Sun") of `d`. */
export function budapestParts(d: Date): { hour: number; weekday: string | undefined } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value),
    weekday: parts.find((p) => p.type === "weekday")?.value,
  };
}
