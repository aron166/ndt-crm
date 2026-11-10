import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[var(--ui-control-h)] w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)] transition-colors outline-none placeholder:text-[var(--ui-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--ui-danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
