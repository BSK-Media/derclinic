"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp } from "lucide-react";
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

function SelectScrollUpButton() {
  return (
    <SelectPrimitive.ScrollUpButton className="flex h-6 cursor-default items-center justify-center bg-white dark:bg-[#0b1220]">
      <ChevronUp className="h-4 w-4 opacity-60" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton() {
  return (
    <SelectPrimitive.ScrollDownButton className="flex h-6 cursor-default items-center justify-center bg-white dark:bg-[#0b1220]">
      <ChevronDown className="h-4 w-4 opacity-60" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export function SelectContent(
  {
    className,
    children,
    disablePortal,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { disablePortal?: boolean }
) {
  const content = (
    <SelectPrimitive.Content
      position="popper"
      sideOffset={6}
      className={cn(
        "z-[1000] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-[#0b1220]",
        className,
      )}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport className="w-full bg-white p-1 dark:bg-[#0b1220]">
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
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
      "relative flex cursor-default select-none items-center rounded-lg bg-white px-2 py-2 text-sm outline-none data-[highlighted]:bg-zinc-100 data-[state=checked]:bg-emerald-50 data-[state=checked]:font-medium dark:bg-[#0b1220] dark:data-[highlighted]:bg-[#0e182a] dark:data-[state=checked]:bg-[#102a2b]",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";
