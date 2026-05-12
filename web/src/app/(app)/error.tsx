"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
      style={{ color: "var(--fg-mute)" }}
    >
      <div
        className="font-mono-ndt text-xs px-2 py-0.5 rounded"
        style={{ background: "var(--coral-soft)", color: "var(--coral)", border: "1px solid oklch(0.72 0.18 25 / 0.35)" }}
      >
        HIBA
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-soft)" }}>
        Valami hiba történt.
      </p>
      {error.digest && (
        <p className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="btn"
        style={{ marginTop: 8 }}
      >
        Újra
      </button>
    </div>
  );
}
