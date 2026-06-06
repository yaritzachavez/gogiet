import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-bold transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[4px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.985] will-change-transform",
  {
    variants: {
      variant: {
        default:
          "border border-orange-400/40 bg-[linear-gradient(180deg,#ff7f26_0%,#ff6b00_55%,#f05a00_100%)] text-white shadow-[0_18px_38px_rgba(255,107,0,0.28)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,#ff8a38_0%,#ff7f26_55%,#ff6b00_100%)] hover:shadow-[0_24px_44px_rgba(255,107,0,0.34)]",
        destructive:
          "bg-red-600 text-white shadow-[0_14px_30px_rgba(220,38,38,0.18)] hover:bg-red-700 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-white/12 bg-white/4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur hover:-translate-y-0.5 hover:border-orange-500/45 hover:bg-orange-500/10 hover:text-white",
        secondary:
          "border border-white/10 bg-[#202020] text-[#f5f5f5] shadow-[0_12px_24px_rgba(0,0,0,0.22)] hover:bg-[#272727]",
        ghost: "text-[#b3b3b3] hover:bg-white/6 hover:text-white",
        link: "text-[#ff7f26] underline-offset-4 hover:text-[#ff9a57] hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-9 rounded-xl gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-12 rounded-2xl px-6 text-base has-[>svg]:px-5",
        icon: "size-11 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
