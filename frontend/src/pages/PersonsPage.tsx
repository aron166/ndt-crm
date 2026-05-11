import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { Search, Users } from 'lucide-react'
import { usePersons } from '@/hooks/usePersons'
import { useDebounce } from '@/hooks/useDebounce'
import { Pagination } from '@/components/Pagination'
import type { PersonSummary } from '@/types/person'

const col = createColumnHelper<PersonSummary>()

const columns = [
  col.display({
    id: 'name',
    header: 'Név',
    cell: (info) => {
      const p = info.row.original
      return (
        <Link
          to={`/persons/${p.id}`}
          className="font-medium text-slate-900 hover:text-indigo-700 transition-colors"
        >
          {p.lastName} {p.firstName}
        </Link>
      )
    },
  }),
  col.accessor('currentCompany', {
    header: 'Jelenlegi cég',
    cell: (info) => {
      const company = info.getValue()
      if (!company) return <span className="text-slate-400">—</span>
      return (
        <Link
          to={`/companies/${company.id}`}
          className="text-slate-700 hover:text-indigo-700 transition-colors"
        >
          {company.name}
        </Link>
      )
    },
  }),
  col.accessor('email', {
    header: 'E-mail',
    cell: (info) => {
      const v = info.getValue()
      return v
        ? <a href={`mailto:${v}`} className="text-slate-600 hover:text-indigo-700 transition-colors">{v}</a>
        : <span className="text-slate-400">—</span>
    },
  }),
  col.accessor('phone', {
    header: 'Telefon',
    cell: (info) => {
      const v = info.getValue()
      return v
        ? <a href={`tel:${v}`} className="text-slate-600 hover:text-indigo-700 transition-colors">{v}</a>
        : <span className="text-slate-400">—</span>
    },
  }),
]

export default function PersonsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading, isError } = usePersons({
    page,
    pageSize: 25,
    search: debouncedSearch || undefined,
  })

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.meta.pageCount ?? -1,
  })

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value)
    setPage(1)
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Személyek</h1>
        <span className="text-sm text-slate-500">
          {data ? `${data.meta.total} személy` : ''}
        </span>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Keresés név, e-mail, telefon alapján…"
            value={search}
            onChange={handleSearchChange}
            className="w-full h-9 pl-8 pr-3 text-sm border border-slate-200 rounded bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                       placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base font-medium text-slate-600">Hiba történt a betöltés során.</p>
            <p className="text-sm text-slate-400 mt-1">Kérjük, próbálja újra.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>

                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {columns.map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length}>
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <Users size={40} className="text-slate-300 mb-3" />
                          <p className="text-base font-medium text-slate-600">Nincs találat</p>
                          <p className="text-sm text-slate-400 mt-1">
                            Módosítsa a keresési feltételeket.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 text-sm">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data && data.meta.pageCount > 1 && (
              <Pagination meta={data.meta} onPageChange={setPage} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
