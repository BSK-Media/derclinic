import * as React from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-900", className)} {...props} />;
}
