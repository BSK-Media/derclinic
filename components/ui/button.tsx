import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-black text-white hover:opacity-90 dark:bg-white dark:text-black",
  secondary: "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700",
  outline: "border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
  ghost: "hover:bg-zinc-100 dark:hover:bg-zinc-900",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};
const sizes: Record<NonNullable<ButtonProps["size"]>, string> = { default: "h-10 px-4", sm: "h-9 px-3", lg: "h-11 px-6" };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant="default", size="default", ...props }, ref) => (
  <button ref={ref} className={cn("inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors disabled:opacity-50", variants[variant], sizes[size], className)} {...props} />
));
Button.displayName = "Button";
