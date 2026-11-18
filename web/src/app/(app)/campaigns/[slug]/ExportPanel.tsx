"use client";
// Export tab section: downloads the queued members as a CSV for a cold-mail tool, then marks them exported.
// Hungarian copy is PROPOSAL until Áron approves it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { exportCampaignCsvAction, markExportedAction } from "@/app/actions/campaign-hub";
import k from "@/components/astryx/page.module.css";

export function ExportPanel({ slug, queued }: { slug: string; queued: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ids, setIds] = useState<number[] | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch { setError("Hálózati hiba, próbáld újra"); } finally { setBusy(false); }
  }
  const download = () => run(async () => {
    setIds(null); setInfo(null);
    const res = await exportCampaignCsvAction(slug);
    if ("error" in res) { setError(res.error); return; }
    if (typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${slug}-export.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }
    setIds(res.memberIds);
    setInfo(`${res.memberIds.length} tag a fájlban; ${res.skippedNoEmail} tag kimaradt (nincs e-mail cím).`);
  });
  const mark = () => run(async () => {
    const res = await markExportedAction(slug, ids ?? []);
    if ("error" in res) { setError(res.error); return; }
    setIds(null);
    setInfo(`${res.marked} tag megjelölve: a CRM már nem küld nekik e-mailt.`);
    router.refresh();
  });

  return (
    <section aria-label="Export">
      <h2>Export hidegküldő eszközbe</h2>
      <p className={k.muted}>Csak a még elérhető (várakozó) tagok kerülnek a fájlba. Megjelölés után a CRM nem küld nekik levelet, a hidegküldő eszköz viszi tovább őket.</p>
      <button type="button" className={k.btn} onClick={download} disabled={busy}>CSV letöltése</button>
      {ids && ids.length > 0 && (
        <button type="button" className={k.btn} onClick={mark} disabled={busy}>{`Exportáltnak jelölöm (${ids.length})`}</button>
      )}
      {info && <p>{info}</p>}
      {error && <p className={k.error} role="alert">{error}</p>}
    </section>
  );
}
