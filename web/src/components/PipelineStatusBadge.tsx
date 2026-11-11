// Pipeline status: 0=KUKA 1=Nem hívtuk 2=NV 3=Érdeklődő 4=Nem érdekelt 5=Kéri 6=Folyamatban 7=CL 8=CW
const STATUS_MAP: Record<number, { label: string; tone: string }> = {
  0: { label: "KUKA",         tone: "slate" },
  1: { label: "Nem hívtuk",   tone: "slate" },
  2: { label: "NV",           tone: "amber" },
  3: { label: "Érdeklődő",    tone: "sky" },
  4: { label: "Nem érdekelt", tone: "coral" },
  5: { label: "Kéri",         tone: "mint" },
  6: { label: "Folyamatban",  tone: "sky" },
  7: { label: "CL",           tone: "slate" },
  8: { label: "CW",           tone: "mint" },
};

export function PipelineStatusBadge({
  status,
}: {
  status: string | number | null | undefined;
}) {
  const key = status != null ? parseInt(String(status), 10) : 1;
  const s = STATUS_MAP[isNaN(key) ? 1 : key] ?? STATUS_MAP[1];
  return (
    <span className={`badge-ds dot ${s.tone}`}>{s.label}</span>
  );
}
