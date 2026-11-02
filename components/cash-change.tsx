"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const BANKNOTES = [20, 50, 100, 200, 500];

/**
 * Kalkulator reszty przy płatności gotówką: kasjer wpisuje, ile klient dał, a system pokazuje, ile wydać.
 * Tylko pomoc przy kasie — kwota „dał klient” nie jest nigdzie zapisywana.
 */
export function CashChange({ amount }: { amount: number }) {
  const [given, setGiven] = React.useState("");
  if (amount <= 0) return null;

  const givenGrosze = given.trim() ? parsePLNToGrosze(given) : null;
  const valid = givenGrosze !== null && !Number.isNaN(givenGrosze) && givenGrosze >= 0;
  const diff = valid ? givenGrosze - amount : null;

  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Gotówka do zapłaty: {formatPLNFromGrosze(amount)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-zinc-600 dark:text-zinc-300" htmlFor="cash-given">
          Klient daje (zł)
        </label>
        <Input
          id="cash-given"
          className="h-9 w-32"
          inputMode="decimal"
          placeholder="np. 200"
          value={given}
          onChange={(e) => setGiven(e.target.value)}
        />
        <button
          type="button"
          className="rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
          onClick={() => setGiven((amount / 100).toFixed(2).replace(".", ","))}
        >
          dokładnie
        </button>
        {BANKNOTES.filter((note) => note * 100 >= amount).slice(0, 3).map((note) => (
          <button
            key={note}
            type="button"
            className="rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
            onClick={() => setGiven(String(note))}
          >
            {note} zł
          </button>
        ))}
      </div>
      {diff === null ? null : diff >= 0 ? (
        <div className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
          {diff === 0 ? "Bez reszty" : `Do wydania: ${formatPLNFromGrosze(diff)}`}
        </div>
      ) : (
        <div className="text-sm font-medium text-red-600">Brakuje jeszcze {formatPLNFromGrosze(-diff)}</div>
      )}
    </div>
  );
}
