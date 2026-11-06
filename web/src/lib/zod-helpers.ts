/** Blank or whitespace-only strings become undefined; everything else passes through. */
export const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
