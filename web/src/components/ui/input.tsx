import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "min-h-[var(--ui-control-h)] pointer-coarse:min-h-[var(--ui-control-h-touch)] w-full min-w-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-control-border)] bg-[var(--ui-surface)] px-3 py-1 text-base md:text-sm text-[var(--ui-text)] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ui-text)] placeholder:text-[var(--ui-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--ui-danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
