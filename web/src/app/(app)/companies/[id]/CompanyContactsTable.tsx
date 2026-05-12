"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Phone } from "lucide-react";
import { LogInteractionModal } from "@/components/LogInteractionModal";
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

export function CompanyContactsTable({
  contacts,
  companyId,
  companyName,
}: CompanyContactsTableProps) {
  const router = useRouter();
  const [logging, setLogging] = useState<Contact | null>(null);

  if (contacts.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        Nincs rögzített kapcsolat.
      </p>
    );
  }

  return (
    <>
      {logging && (
        <LogInteractionModal
          open
          onClose={() => {
            setLogging(null);
            router.refresh();
          }}
          companyId={companyId}
          personId={logging.personId}
          companyName={companyName}
          personName={`${logging.person.firstName ?? ""} ${logging.person.lastName ?? ""}`.trim()}
        />
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">Személy</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Beosztás</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Email</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Telefon</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Státusz</th>
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/persons/${c.personId}`}
                    className="font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {c.person.firstName} {c.person.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                  {c.role ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                  {c.email ?? c.person.email ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                  {c.phone ?? c.person.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {c.endedAt ? (
                    <span className="text-xs text-slate-400">
                      Volt ({formatDate(c.endedAt)}-ig)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                      Aktív
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!c.endedAt && (
                    <button
                      onClick={() => setLogging(c)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium transition-colors"
                    >
                      <Phone className="size-3.5" />
                      Naplózás
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
