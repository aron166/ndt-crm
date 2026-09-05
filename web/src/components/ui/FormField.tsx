import type { ReactNode } from "react";

interface FormFieldProps {
  /** Field label (Hungarian). A `*` is appended when `required`. */
  label: string;
  /** Marks the field required in the label. Set `required` on the input too. */
  required?: boolean;
  /** Optional help text under the control. */
  hint?: string;
  /** Field-level error; replaces the hint when set. */
  error?: string | null;
  /** Span the full width of a multi-column grid. */
  full?: boolean;
  /** The control: `<input className="input-ds">`, `<select>`, `<textarea>`, … */
  children: ReactNode;
}

/**
 * The one label+control wrapper for every dialog and form (Phase 1.5).
 * Before this, 5 modals used `.field-group`/`.field-label` and ~11 hand-rolled
 * their own labels with ad-hoc inline styles. Layout stays the caller's job —
 * this owns the label, the hint and the error only.
 */
export function FormField({ label, required, hint, error, full, children }: FormFieldProps) {
  return (
    <div className="field-group" style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label className="field-label">{label}{required ? " *" : ""}</label>
      {children}
      {error ? (
        <p style={{ fontSize: 12, color: "var(--coral)", marginTop: 4 }}>{error}</p>
      ) : hint ? (
        <p style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 4 }}>{hint}</p>
      ) : null}
    </div>
  );
}
