import { db } from "@/lib/db";
import Link from "next/link";
import { PersonsSearch } from "./PersonsSearch";

const PAGE_SIZE = 25;
const TENANT_ID = 1;

interface SearchParams {
  search?: string;
  page?: string;
}

export default async function PersonsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const where = {
    tenantId: TENANT_ID,
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [persons, total] = await Promise.all([
    db.person.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        contacts: {
          where: { endedAt: null },
          include: { company: { select: { id: true, name: true } } },
          take: 1,
          orderBy: { startedAt: "desc" },
        },
      },
    }),
    db.person.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Személyek</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} találat</p>
        </div>
      </div>

      <PersonsSearch search={search} />

      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">
                Név
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                Jelenlegi cég
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                Email
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                Telefon
              </th>
            </tr>
          </thead>
          <tbody>
            {persons.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-slate-400"
                >
                  Nincs találat.
                </td>
              </tr>
            )}
            {persons.map((p) => {
              const currentContact = p.contacts[0];
              return (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/persons/${p.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-600 transition-colors"
                    >
                      {p.lastName} {p.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {currentContact ? (
                      <Link
                        href={`/companies/${currentContact.company.id}`}
                        className="text-slate-600 hover:text-indigo-600"
                      >
                        {currentContact.company.name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                    {p.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                    {p.phone ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} /{" "}
            {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/persons?search=${search}&page=${page - 1}`}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-100"
              >
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/persons?search=${search}&page=${page + 1}`}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-100"
              >
                Következő →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
