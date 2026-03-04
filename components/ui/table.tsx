import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Table components (shadcn-compatible exports)
 * This project originally used short aliases (THead/TBody/TR/TH/TD).
 * We keep them for backwards-compatibility and also export the standard
 * shadcn names used across the codebase (TableHeader/TableBody/TableRow/TableHead/TableCell).
 */

export function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-sm", className)} {...props} />;
}

// Short aliases (kept)
export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-zinc-200 dark:border-zinc-800", className)}
      {...props}
    />
  );
}

export function TBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-zinc-100 dark:border-zinc-900", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400",
        className
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2", className)} {...props} />;
}

// Shadcn-compatible names (aliases)
export const TableHeader = THead;
export const TableBody = TBody;
export const TableRow = TR;
export const TableHead = TH;
export const TableCell = TD;
