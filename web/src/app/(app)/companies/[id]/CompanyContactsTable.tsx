"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, UserPlus, X } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { LogInteractionModal } from "@/components/LogInteractionModal";
import { AddContactModal } from "./AddContactModal";
import { closeContact } from "@/app/actions/contacts";
import { formatDate } from "@/lib/utils";
import k from "@/components/astryx/page.module.css";
import s from "../companies.module.css";

interface Contact {
  id: number;
  personId: number;
  role: string | null;
  email: string | null;
  phone: string | null;
  endedAt: Date | null;
  person: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
}

interface CompanyContactsTableProps {
  contacts: Contact[];
  companyId: number;
  companyName: string;
}

export function CompanyContactsTable({ contacts, companyId, companyName }: CompanyContactsTableProps) {
  const router = useRouter();
  const [logging, setLogging] = useState<Contact | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function handleClose(contact: Contact) {
    if (!confirm(`Lezárod ${contact.person.firstName} ${contact.person.lastName} kapcsolatát ezzel a céggel?`)) return;
    await closeContact(contact.id, companyId, contact.personId);
    router.refresh();
  }

  return (
    <>
      {logging && (
        <LogInteractionModal
          open
          onClose={() => { setLogging(null); router.refresh(); }}
          companyId={companyId}
          personId={logging.personId}
          companyName={companyName}
          personName={`${logging.person.firstName ?? ""} ${logging.person.lastName ?? ""}`.trim()}
        />
      )}
      <AddContactModal open={addOpen} onClose={() => setAddOpen(false)} companyId={companyId} />

      <div className={s.head}>
        <p className={k.muted}>
          {contacts.filter(c => !c.endedAt).length} aktív · {contacts.filter(c => c.endedAt).length} korábbi
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className={`${k.btn} ${k.btnPrimary}`}
        >
          <UserPlus className="size-3.5" />
          Kapcsolat hozzáadása
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className={k.empty}>Nincs rögzített kapcsolat.</p>
      ) : (
        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead>
              <tr>
                <th>Személy</th>
                <th className="hidden md:table-cell">Beosztás</th>
                <th className="hidden md:table-cell">Email</th>
                <th className="hidden lg:table-cell">Telefon</th>
                <th>Státusz</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/persons/${c.personId}`} className={k.strong}>
                      {c.person.firstName} {c.person.lastName}
                    </Link>
                  </td>
                  <td className="hidden md:table-cell">{c.role ?? "-"}</td>
                  <td className="hidden md:table-cell">{c.email ?? c.person.email ?? "-"}</td>
                  <td className="hidden lg:table-cell">{c.phone ?? c.person.phone ?? "-"}</td>
                  <td>
                    {c.endedAt ? (
                      <span className={k.muted}>Volt ({formatDate(c.endedAt)}-ig)</span>
                    ) : (
                      <Badge variant="success" label="Aktív" />
                    )}
                  </td>
                  <td>
                    <div className={s.rowActions}>
                      {!c.endedAt && (
                        <>
                          <button
                            onClick={() => setLogging(c)}
                            className={k.btn}
                            title="Interakció naplózása"
                          >
                            <Phone className="size-3" />
                            Naplózás
                          </button>
                          <button
                            onClick={() => handleClose(c)}
                            className={k.btn}
                            title="Kapcsolat lezárása"
                          >
                            <X className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
