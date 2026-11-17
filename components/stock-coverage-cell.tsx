"use client";

import * as React from "react";
import type { ProductCoverageDto } from "@/lib/stock-coverage-db";

export type CoverageHorizon = 14 | 30 | 60 | 90;
export const HORIZON_OPTIONS: CoverageHorizon[] = [14, 30, 60, 90];

const number = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw" });

/** Wybór horyzontu zaplanowanych wizyt, na które sprawdzamy zapas materiałów. */
export function CoverageHorizonSelect({ value, onChange }: { value: number; onChange: (days: CoverageHorizon) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className="whitespace-nowrap">Wizyty na:</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value) as CoverageHorizon)}
        className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800 dark:border-white/10 dark:bg-zinc-950 dark:text-slate-100"
        aria-label="Horyzont zaplanowanych wizyt"
      >
        {HORIZON_OPTIONS.map((days) => (
          <option key={days} value={days}>
            {days} dni
          </option>
        ))}
      </select>
    </label>
  );
}

/** Czy zapas wystarczy na zaplanowane wizyty: „zostanie X” albo „brakuje X (od daty)”. */
export function CoverageCell({ coverage, compact }: { coverage: ProductCoverageDto | null | undefined; compact?: boolean }) {
  if (!coverage) {
    return <span className="text-slate-400" title="Brak zaplanowanych wizyt zużywających ten produkt">{compact ? "brak wizyt" : "—"}</span>;
  }
  const short = coverage.balance < 0;
  const title = `Zapotrzebowanie z ${coverage.visits} zaplanowanych wizyt: ${number.format(coverage.demand)}`;
  return (
    <div title={title} className="leading-tight">
      <div className={"font-semibold " + (short ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
        {short ? `brakuje ${number.format(-coverage.balance)}` : `zostanie ${number.format(coverage.balance)}`}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        {short && coverage.shortageAt
          ? `od ${shortDate.format(new Date(coverage.shortageAt))}${coverage.shortageService ? ` (${coverage.shortageService})` : ""}`
          : `potrzeba ${number.format(coverage.demand)} • ${coverage.visits} wiz.`}
      </div>
    </div>
  );
}
