import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '@/lib/utils/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
      variants: {
        variant: {
          default: "bg-[#fdc23e] text-[#153356] hover:bg-[#e6b035] font-medium",
          destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          outline: "border border-[#1e3d5c] bg-transparent hover:bg-[#1e3d5c] text-[#153356] hover:text-white",
          secondary: "bg-[#1e3d5c] text-white hover:bg-[#2a4d6b]",
          ghost: "hover:bg-[#1e3d5c] text-[#153356] hover:text-white",
          link: "text-[#fdc23e] underline-offset-4 hover:underline hover:text-[#e6b035]",
        },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }


