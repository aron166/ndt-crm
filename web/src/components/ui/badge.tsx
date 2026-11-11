import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[var(--ui-radius-pill)] border border-transparent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-[var(--ui-danger)] [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-[var(--ui-accent)] text-[var(--ui-on-accent)] [a]:hover:bg-[color-mix(in_srgb,var(--ui-accent)_85%,white)]",
        secondary:
          "bg-[var(--ui-surface-muted)] text-[var(--ui-text)] [a]:hover:bg-[var(--ui-hover)]",
        destructive:
          "border-[var(--ui-danger)] bg-[var(--ui-danger-surface)] text-[var(--ui-text)] [a]:hover:bg-[var(--ui-hover)]",
        outline:
          "border-[var(--ui-border-strong)] text-[var(--ui-text)] [a]:hover:bg-[var(--ui-hover)]",
        ghost:
          "hover:bg-[var(--ui-hover)] text-[var(--ui-text)]",
        link: "text-[var(--ui-text-link)] underline underline-offset-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
