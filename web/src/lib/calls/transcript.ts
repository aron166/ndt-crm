// Pure transcript validation. Lives outside the "use server" action file
// because a `"use server"` module may only export async functions — exporting
// this helper from there type-checks locally and fails the production build.

/** Kept short: this is a list-preview, the full transcript stays in `transcript`. */
export const NOTE_PREVIEW_LEN = 200;
export const TRANSCRIPT_MAX = 100_000;

export function validateTranscript(transcript: string): { text: string } | { error: string } {
  const text = transcript.trim();
  if (!text) return { error: "Az átirat nem lehet üres" };
  if (text.length > TRANSCRIPT_MAX) return { error: "Az átirat túl hosszú" };
  return { text };
}
