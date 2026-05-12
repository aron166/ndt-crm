import { cn } from "@/lib/utils";

const STATUS_MAP = {
  created:     { label: "Kiírva",       bg: "bg-slate-100",  text: "text-slate-600" },
  not_started: { label: "Kiírva",       bg: "bg-slate-100",  text: "text-slate-600" }, // legacy
  in_progress: { label: "Folyamatban",  bg: "bg-blue-50",    text: "text-blue-700"  },
  done:        { label: "Elvégezve",    bg: "bg-green-50",   text: "text-green-700" },
  cancelled:   { label: "Törölve",      bg: "bg-red-50",     text: "text-red-500"   },
} as const;

type TaskStatus = keyof typeof STATUS_MAP;

export function TaskStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status as TaskStatus] ?? STATUS_MAP.created;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", s.bg, s.text)}>
      {s.label}
    </span>
  );
}
