"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export function SelectContent(
  {
    className,
    disablePortal,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { disablePortal?: boolean }
) {
  const content = (
    <SelectPrimitive.Content
      position="popper"
      sideOffset={6}
      className={cn(
        "z-[1000] max-h-[var(--radix-select-content-available-height)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1" />
    </SelectPrimitive.Content>
  );

  // Radix Dialog ustawia `pointer-events: none` na <body> w trybie modal.
  // Jeśli SelectContent jest w Portalu (czyli w <body>), to dropdown może być nieklikalny.
  // Dla formularzy w dialogu użyj `disablePortal`.
  return disablePortal ? content : <SelectPrimitive.Portal>{content}</SelectPrimitive.Portal>;
}

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-900",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 inline-flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText className="pl-5">{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";
