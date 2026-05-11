import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { Search, Building2 } from 'lucide-react'
import { useCompanies } from '@/hooks/useCompanies'
import { useDebounce } from '@/hooks/useDebounce'
import { PipelineStatusBadge } from '@/components/PipelineStatusBadge'
import { Pagination } from '@/components/Pagination'
import { formatDate } from '@/lib/utils'
import type { Company } from '@/types/company'

const col = createColumnHelper<Company>()

const columns = [
  col.accessor('name', {
    header: 'Cég neve',
    cell: (info) => (
      <Link
        to={`/companies/${info.row.original.id}`}
        className="font-medium text-slate-900 hover:text-indigo-700 transition-colors"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  col.accessor('vatNumber', {
    header: 'Adószám',
    cell: (info) => (
      <span className="font-mono text-slate-600">{info.getValue() ?? '—'}</span>
    ),
  }),
  col.accessor('city', {
    header: 'Város',
    cell: (info) => <span className="text-slate-600">{info.getValue() ?? '—'}</span>,
  }),
  col.accessor('accountType', {
    header: 'Típus',
    cell: (info) => <span className="text-slate-600">{info.getValue() ?? '—'}</span>,
  }),
  col.accessor('pipelineStatus', {
    header: 'Státusz',
    cell: (info) => <PipelineStatusBadge status={info.getValue() ?? null} />,
  }),
  col.accessor('lastInteractionDate', {
    header: 'Utolsó kapcsolat',
    cell: (info) => {
      const v = info.getValue()
      return <span className="text-slate-500">{v ? formatDate(v) : '—'}</span>
    },
  }),
]

export default function CompaniesPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [includeFA, setIncludeFA] = useState(false)

  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading, isError } = useCompanies({
    page,
    pageSize: 25,
    search: debouncedSearch || undefined,
    includeFA,
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
        <h1 className="text-2xl font-bold text-slate-900">Cégek</h1>
        <span className="text-sm text-slate-500">
          {data ? `${data.meta.total} cég` : ''}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Keresés név, adószám, város alapján…"
            value={search}
            onChange={handleSearchChange}
            className="w-full h-9 pl-8 pr-3 text-sm border border-slate-200 rounded bg-white
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                       placeholder:text-slate-400"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeFA}
            onChange={(e) => { setIncludeFA(e.target.checked); setPage(1) }}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          F.A. megjelenítése
        </label>
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
                          <Building2 size={40} className="text-slate-300 mb-3" />
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
