import { cn } from '@/lib/utils'

interface StatusStyle {
  label: string
  color: string
  bg: string
}

const STATUS_MAP: Record<string, StatusStyle> = {
  '0': { label: 'KUKA',                  color: '#64748B', bg: '#F1F5F9' },
  '1': { label: 'NEM HÍVTUK',            color: '#64748B', bg: '#F8FAFC' },
  '2': { label: 'HÍVTUK — NEM ÉRT. EL', color: '#B45309', bg: '#FEF3C7' },
  '3': { label: 'HÍVTUK — ÉRDEKEL',      color: '#1D4ED8', bg: '#EFF6FF' },
  '4': { label: 'HÍVTUK — NEM KELL',     color: '#B91C1C', bg: '#FEF2F2' },
  '5': { label: 'HÍVTUK — KELL',         color: '#4338CA', bg: '#EEF2FF' },
  '6': { label: 'PENDING',               color: '#92400E', bg: '#FEF3C7' },
  '7': { label: 'CL',                    color: '#991B1B', bg: '#FEE2E2' },
  '8': { label: 'CW',                    color: '#065F46', bg: '#ECFDF5' },
}

interface PipelineStatusBadgeProps {
  status: string | null
  className?: string
}

export function PipelineStatusBadge({ status, className }: PipelineStatusBadgeProps) {
  const key = status ?? ''
  const style = STATUS_MAP[key]

  if (!style) {
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
          className,
        )}
        style={{ color: '#64748B', backgroundColor: '#F1F5F9' }}
      >
        —
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        className,
      )}
      style={{ color: style.color, backgroundColor: style.bg }}
    >
      {style.label}
    </span>
  )
}
