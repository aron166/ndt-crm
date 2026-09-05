"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="hu">
      <body style={{ background: "#0f111a", color: "#f5f5f5", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", height: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 12, padding: "2px 8px", background: "oklch(0.72 0.18 25 / 0.14)", color: "oklch(0.72 0.18 25)", border: "1px solid oklch(0.72 0.18 25 / 0.35)", borderRadius: 4 }}>
            KRITIKUS HIBA
          </div>
          <p style={{ fontSize: 14, color: "#aaa", margin: 0 }}>Az alkalmazás összeomlott.</p>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#666", margin: 0 }}>{error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 8, padding: "6px 16px", background: "oklch(0.66 0.19 278 / 0.18)", border: "1px solid oklch(0.66 0.19 278 / 0.4)", color: "oklch(0.66 0.19 278)", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
          >
            Újra
          </button>
        </div>
      </body>
    </html>
  );
}
