import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors duration-[var(--ui-dur-fast)] outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-[var(--ui-danger)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--ui-accent)] text-[var(--ui-on-accent)] hover:brightness-95",
        outline:
          "border-[var(--ui-border-strong)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-hover)] aria-expanded:bg-[var(--ui-hover)]",
        secondary:
          "bg-[var(--ui-surface-muted)] text-[var(--ui-text)] hover:bg-[var(--ui-hover)] aria-expanded:bg-[var(--ui-hover)]",
        ghost:
          "bg-transparent text-[var(--ui-text)] hover:bg-[var(--ui-hover)] aria-expanded:bg-[var(--ui-hover)]",
        destructive:
          "bg-[var(--ui-danger-surface)] text-[var(--ui-danger-text)] hover:brightness-95",
        link: "text-[var(--ui-text-link)] underline underline-offset-4",
      },
      size: {
        default:
          "h-[var(--ui-control-h)] gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 pointer-coarse:min-h-[var(--ui-control-h-touch)]",
        xs: "h-8 gap-1 px-3 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 pointer-coarse:min-h-[var(--ui-control-h-touch)] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1 px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 pointer-coarse:min-h-[var(--ui-control-h-touch)] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-[var(--ui-control-h)] pointer-coarse:size-[var(--ui-control-h-touch)]",
        "icon-xs":
          "size-8 in-data-[slot=button-group]:rounded-lg pointer-coarse:size-[var(--ui-control-h-touch)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 in-data-[slot=button-group]:rounded-lg pointer-coarse:size-[var(--ui-control-h-touch)]",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
