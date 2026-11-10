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
      style={{ color: "var(--ui-text-muted)" }}
    >
      <div
        className="text-xs px-2 py-0.5 rounded"
        style={{ background: "var(--ui-surface-muted)", color: "var(--ui-danger-text)" }}
      >
        HIBA
      </div>
      <p style={{ fontSize: 14, color: "var(--ui-text-muted)" }}>
        Valami hiba történt.
      </p>
      {error.digest && (
        <p className="ui-code" style={{ fontSize: 12, color: "var(--ui-text-disabled)" }}>
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
