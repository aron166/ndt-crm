// Feladó profil: the name and phone the e-mail preview and the campaign launch check read.
// Hungarian copy is PROPOSAL until Áron approves it.
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getActor } from "@/lib/actor";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "../settings.module.css";
import { SenderProfileForm } from "./SenderProfileForm";

const TENANT_ID = 1;
export const metadata = { title: "Feladó profil: Helm CRM" };
export const dynamic = "force-dynamic";

export default async function SenderProfilePage() {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) notFound();
  const me = await db.user.findFirst({ where: { id: userId, tenantId: TENANT_ID }, select: { name: true, settings: true } });
  if (!me) notFound();
  const phone = (me.settings as Record<string, unknown> | null)?.phone;
  return (
    <div className={`mount ${s.stack}`}>
      <PageHeader
        title="Feladó profil"
        help="A kampány e-mailjeibe ez kerül a feladó nevéhez és telefonszámához. A kampány Indítás fülén választod ki, ki a feladó."
      />
      <section className={k.card}>
        <SenderProfileForm name={me.name} phone={typeof phone === "string" ? phone : ""} />
      </section>
    </div>
  );
}
