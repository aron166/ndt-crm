import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
