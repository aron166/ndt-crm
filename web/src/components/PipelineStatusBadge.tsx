import { cn } from "@/lib/utils";

const STATUS_MAP: Record<
  number,
  { label: string; bg: string; text: string }
> = {
  0: { label: "KUKA", bg: "bg-slate-100", text: "text-slate-500" },
  1: { label: "Nem hívtuk", bg: "bg-blue-50", text: "text-blue-600" },
  2: { label: "Hívtuk – NV", bg: "bg-amber-50", text: "text-amber-600" },
  3: { label: "Érdeklődő", bg: "bg-green-50", text: "text-green-600" },
  4: {
    label: "Nem érdekelt",
    bg: "bg-red-50",
    text: "text-red-500",
  },
  5: { label: "Kéri", bg: "bg-emerald-50", text: "text-emerald-600" },
  6: { label: "Folyamatban", bg: "bg-indigo-50", text: "text-indigo-600" },
  7: { label: "CL", bg: "bg-slate-100", text: "text-slate-400" },
  8: { label: "CW", bg: "bg-green-100", text: "text-green-700" },
};

export function PipelineStatusBadge({
  status,
}: {
  status: string | number | null | undefined;
}) {
  const key = status != null ? parseInt(String(status), 10) : 1;
  const s = STATUS_MAP[isNaN(key) ? 1 : key] ?? STATUS_MAP[1];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        s.bg,
        s.text
      )}
    >
      {s.label}
    </span>
  );
}
