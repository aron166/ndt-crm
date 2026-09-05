import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeadStatusSetupClient } from "./LeadStatusSetupClient";

const TENANT_ID = 1;

export default async function LeadStatusSetupPage() {
  const statuses = await db.leadStatus.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: { position: "asc" },
  });

  return (
    <div className="mount">
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/leads"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-mute)" }}
          className="row-link"
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Vissza a leadekhez
        </Link>
      </div>

      <div className="page-head">
        <div>
          <h1 className="page-title">Lead státuszok</h1>
          <p className="page-sub">
            A lead pipeline oszlopai. Húzd át az átrendezéshez; jelöld ki a kezdő oszlopot,
            ahová a beérkező leadek kerülnek.
          </p>
        </div>
      </div>

      <LeadStatusSetupClient statuses={statuses} />
    </div>
  );
}
