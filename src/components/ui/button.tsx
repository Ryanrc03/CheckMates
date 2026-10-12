import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding text-center text-sm leading-tight font-bold text-balance transition-[background-color,box-shadow,transform] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--shadow-press)] hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_8%)] active:translate-y-[2px] active:shadow-none",
        outline: "border-input bg-surface text-foreground hover:bg-surface-sunken",
        ghost: "text-primary-strong hover:bg-surface-sunken",
        link: "text-primary-strong underline underline-offset-4",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        lg: "min-h-13 px-5 py-3 text-base [&_svg:not([class*='size-'])]:size-5",
        icon: "size-11",
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
