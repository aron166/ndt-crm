import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaginationMeta } from '../../../shared/types/index'

interface PaginationProps {
  meta: PaginationMeta
  onPageChange: (page: number) => void
}

export function Pagination({ meta, onPageChange }: PaginationProps) {
  const { page, pageCount, total, pageSize } = meta
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
      <p className="text-xs text-slate-500">
        {from}–{to} / {total} találat
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 transition-colors',
            page <= 1 && 'opacity-40 cursor-not-allowed',
          )}
        >
          <ChevronLeft size={14} />
        </button>

        <span className="text-xs text-slate-700 px-2">
          {page} / {pageCount}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 transition-colors',
            page >= pageCount && 'opacity-40 cursor-not-allowed',
          )}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
