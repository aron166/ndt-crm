import { db } from "@/lib/db";
import Link from "next/link";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { CompaniesSearch } from "./CompaniesSearch";

const PAGE_SIZE = 25;
const TENANT_ID = 1;

interface SearchParams {
  search?: string;
  page?: string;
  fa?: string;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const includeFA = params.fa === "1";

  const where = {
    tenantId: TENANT_ID,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { vatNumber: { contains: search, mode: "insensitive" as const } },
            { city: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(includeFA ? {} : { NOT: { name: { contains: "F.A." } } }),
  };

  const [companies, total] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.company.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cégek</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} találat</p>
        </div>
      </div>

      <CompaniesSearch search={search} includeFA={includeFA} />

      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">
                Cég neve
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                Státusz
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                Város
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                Pipeline
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden xl:table-cell">
                Utolsó interakció
              </th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  Nincs találat.
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/companies/${c.id}`}
                    className="font-medium text-slate-900 hover:text-indigo-600 transition-colors"
                  >
                    {c.name}
                  </Link>
                  {c.vatNumber && (
                    <p className="text-xs text-slate-400">{c.vatNumber}</p>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-slate-500 text-xs">{c.status ?? "—"}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-600">
                  {c.city ?? "—"}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <PipelineStatusBadge status={c.pipelineStatus} />
                </td>
                <td className="px-4 py-3 hidden xl:table-cell text-slate-500 text-xs">
                  {formatDate(c.lastInteractionDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/companies?search=${search}&page=${page - 1}&fa=${includeFA ? "1" : "0"}`}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-100"
              >
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/companies?search=${search}&page=${page + 1}&fa=${includeFA ? "1" : "0"}`}
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
