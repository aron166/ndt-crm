export type SlugOpts = {
  /** Separator that replaces every run of non [a-z0-9] characters. */
  sep: "_" | "-";
  /** Hard cut applied after trimming separators (may leave a trailing separator). */
  max?: number;
  /** Returned when the result is empty. */
  fallback: string;
};

/** Accent-stripped, lowercased ASCII slug. */
export function slugify(input: string, { sep, max, fallback }: SlugOpts): string {
  const s = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (á→a, ő→o)
    .replace(/[^a-z0-9]+/g, sep)
    .replace(sep === "_" ? /^_+|_+$/g : /^-+|-+$/g, "");
  return (max === undefined ? s : s.slice(0, max)) || fallback;
}
