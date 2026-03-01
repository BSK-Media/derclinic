import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700", className)} {...props} />
));
Input.displayName = "Input";
