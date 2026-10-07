import { db } from "@/lib/db";
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
    <div className="mount space-y-5">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)" }}>
          Tiltólista
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Akik kérték, hogy ne keressük őket. Minden kiküldés és célpontlista kihagyja őket. Csak hozzáadni lehet.
        </p>
      </div>
      <div className="panel">
        <SuppressionForm />
      </div>
      <div className="panel">
        {rows.length === 0 ? (
          <div className="panel-pad text-sm text-slate-500">Még nincs senki a tiltólistán.</div>
        ) : (
          <table className="tbl" style={{ width: "100%" }}>
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
        )}
      </div>
    </div>
  );
}
