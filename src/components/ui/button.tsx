import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { tapHaptic } from "@/lib/native";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-[15px] font-semibold ring-offset-background transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-border bg-transparent hover:bg-card-inner",
        secondary: "bg-card-inner text-foreground border border-border hover:bg-card-inner/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // App-wide rule: buttons are 48–52px tall with 16px corners. The
        // compact size is for inline chips only and extends its hit area to
        // 44px with an invisible ::after instead of growing visually.
        default: "h-12 px-5",
        sm: "h-9 px-3 text-sm after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        lg: "h-[52px] px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onPointerUp, onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerDown={(e) => {
          onPointerDown?.(e);
          if (e.pointerType === "touch") tapHaptic();
        }}
        onPointerUp={(e) => {
          onPointerUp?.(e);
          // Only fires for mouse/touch/pen, never keyboard activation — so
          // this clears the focus ring right after a tap/click (instead of it
          // staying lit until something else is tapped) without affecting
          // keyboard users, who still see and keep the ring as expected.
          const target = e.currentTarget as HTMLElement;
          requestAnimationFrame(() => target.blur());
        }}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
