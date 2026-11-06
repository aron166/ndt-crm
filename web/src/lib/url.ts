// URL checks shared by server and client code (no imports: client-safe).

/**
 * True when the string parses as an http(s) URL. new URL() alone also accepts
 * javascript: and data:, which become a stored XSS sink once rendered into an href.
 */
export function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

/** The URL when it is http(s), else null: for rendering untrusted links. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  return url && isHttpUrl(url) ? url : null;
}

/** https-only, for URLs we call or send to people (webhooks, the intro material link). */
export function isHttpsUrl(u: string): boolean {
  return /^https:\/\//i.test(u);
}
