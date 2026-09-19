import { cache } from "react";
import { db } from "./db";
import { getActor } from "./actor";

export type Theme = "dark" | "light";

/** Dark is the product's default — a user only ever sees light by asking. */
export const DEFAULT_THEME: Theme = "dark";

export function parseTheme(settings: unknown): Theme {
  const t = (settings as { theme?: unknown } | null)?.theme;
  return t === "light" ? "light" : DEFAULT_THEME;
}

/**
 * The signed-in user's theme, for the `data-theme` attribute on <html>.
 *
 * Read server-side and rendered into the first HTML byte, so there is no
 * flash of the wrong theme and no client-side storage to keep in sync — the
 * `users` row IS the store, which is what makes the choice follow the user
 * to another device. One extra indexed read per document request; `cache()`
 * dedupes it within a request.
 *
 * Never throws: a DB hiccup in the root layout would take down every route,
 * and the only thing at stake is a colour.
 */
export const getTheme = cache(async (): Promise<Theme> => {
  try {
    const { userId } = await getActor(1);
    if (userId == null) return DEFAULT_THEME;
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    return parseTheme(row?.settings);
  } catch {
    return DEFAULT_THEME;
  }
});
