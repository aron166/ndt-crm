import { db } from "@/lib/db";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "../settings.module.css";
import { SuppressionForm } from "./SuppressionForm";

const TENANT_ID = 1;
export const metadata = { title: "Tiltólista: Helm CRM" };
export const dynamic = "force-dynamic";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function SuppressionsPage() {
  const rows = await db.suppression.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return (
    <div className={`mount ${s.stack}`}>
      <PageHeader
        title="Tiltólista"
        help="Akik kérték, hogy ne keressük őket. Minden kiküldés és célpontlista kihagyja őket. Csak hozzáadni lehet."
      />
      <section className={k.card}>
        <SuppressionForm />
      </section>
      <section className={k.card}>
        {rows.length === 0 ? (
          <div className={k.muted}>Még nincs senki a tiltólistán.</div>
        ) : (
          <div className={k.tableWrap}>
            <table className={k.table}>
              <thead>
                <tr>
                  <th>Email cím vagy domain</th>
                  <th>Kérés dátuma</th>
                  <th>Csatorna</th>
                  <th>Forrás</th>
                  <th>Megjegyzés</th>
                  <th>Felvéve</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email ?? `@${r.domain}`}</td>
                    <td>{day(r.requestedAt)}</td>
                    <td>{r.channel ?? ""}</td>
                    <td>{r.source ?? ""}</td>
                    <td>{r.note ?? ""}</td>
                    <td>{day(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
