// Kampányok > Új kampány. Hungarian copy is PROPOSAL until Áron approves it.
import Link from "next/link";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import { db } from "@/lib/db";
import { CreateCampaignForm } from "./CreateCampaignForm";

export const dynamic = "force-dynamic";
const TENANT_ID = 1;

export default async function NewCampaignPage() {
  // id 1 "Migration" is the import system user, never an owner.
  const users = await db.user.findMany({ where: { tenantId: TENANT_ID, name: { not: "Migration" } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="mount">
      <Link href="/campaigns" className={k.back}>Kampányok</Link>
      <PageHeader title="Új kampány" help="A típust most választod; utána a lépések ehhez igazodnak." />
      <CreateCampaignForm users={users} />
    </div>
  );
}
