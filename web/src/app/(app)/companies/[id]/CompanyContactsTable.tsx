"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone, UserPlus, X } from "lucide-react";
import { LogInteractionModal } from "@/components/LogInteractionModal";
import { AddContactModal } from "./AddContactModal";
import { closeContact } from "@/app/actions/contacts";
import { formatDate } from "@/lib/utils";

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

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">
          {contacts.filter(c => !c.endedAt).length} aktív · {contacts.filter(c => c.endedAt).length} korábbi
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
        >
          <UserPlus className="size-3.5" />
          Kapcsolat hozzáadása
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">Nincs rögzített kapcsolat.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-500">Személy</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Beosztás</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Telefon</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">Státusz</th>
                <th className="px-4 py-3 w-32" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/persons/${c.personId}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {c.person.firstName} {c.person.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.role ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.email ?? c.person.email ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{c.phone ?? c.person.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.endedAt ? (
                      <span className="text-xs text-slate-400">Volt ({formatDate(c.endedAt)}-ig)</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Aktív</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {!c.endedAt && (
                        <>
                          <button
                            onClick={() => setLogging(c)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium"
                            title="Interakció naplózása"
                          >
                            <Phone className="size-3" />
                            Naplózás
                          </button>
                          <button
                            onClick={() => handleClose(c)}
                            className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500"
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
