"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

type Figures = { appointments: number; revenue: number; materialCost: number; payout: number };
type Override = {
  appointments: number | null;
  revenue: number | null;
  materialCost: number | null;
  payout: number | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const toInput = (grosze: number | null) => (grosze === null ? "" : (grosze / 100).toFixed(2).replace(".", ","));

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

// Rozliczenie niestandardowe specjalisty za miesiąc (tylko administrator): ręcznie wpisane wartości zastępują policzone z wizyt
// w rozliczeniach, podsumowaniu finansowym, szczegółach pracownika i analityce. Wizyty, ceny i płatności zostają bez zmian.
export function SpecialistMonthSettlement({ specialistId }: { specialistId: string }) {
  const [month, setMonth] = React.useState(currentMonth);
  const { data, mutate, isLoading } = useSWR<{ ok: boolean; message?: string; standard: Figures; override: Override | null }>(
    month ? `/api/admin/specialists/${specialistId}/month-settlement?month=${month}` : null,
    fetcher,
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <div className="font-semibold">Rozliczenie niestandardowe</div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Wpisz ręcznie wartości za wybrany miesiąc. Zapisane wartości <strong>zastępują policzone z wizyt</strong> w rozliczeniach, podsumowaniu
          finansowym, szczegółach tego pracownika i w analityce (ranking specjalistów). Pole puste oznacza „zostaw wartość standardową”. Wizyty,
          ceny i płatności pozostają bez zmian. Nadpisanie działa wtedy, gdy wybrany zakres dat obejmuje cały miesiąc.
        </p>
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div className="space-y-1">
            <Label htmlFor="ms-month">Miesiąc</Label>
            <Input id="ms-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
        </div>
      </Card>

      {isLoading && !data ? <Card className="p-4 text-sm text-zinc-500">Ładowanie…</Card> : null}
      {data && !data.ok ? <Card className="p-4 text-sm text-red-600">{data.message || "Nie udało się wczytać rozliczenia."}</Card> : null}
      {data?.ok ? (
        <SettlementForm
          key={`${month}-${data.override?.updatedAt ?? "none"}`}
          specialistId={specialistId}
          month={month}
          standard={data.standard}
          override={data.override}
          onSaved={() => void mutate()}
        />
      ) : null}
    </div>
  );
}

function SettlementForm({
  specialistId,
  month,
  standard,
  override,
  onSaved,
}: {
  specialistId: string;
  month: string;
  standard: Figures;
  override: Override | null;
  onSaved: () => void;
}) {
  const [count, setCount] = React.useState(override?.appointments === null || override === null ? "" : String(override.appointments));
  const [revenue, setRevenue] = React.useState(toInput(override?.revenue ?? null));
  const [cost, setCost] = React.useState(toInput(override?.materialCost ?? null));
  const [payout, setPayout] = React.useState(toInput(override?.payout ?? null));
  const [note, setNote] = React.useState(override?.note ?? "");
  const [saving, setSaving] = React.useState(false);

  const parseMoney = (value: string): number | null | "invalid" => {
    if (!value.trim()) return null;
    const grosze = parsePLNToGrosze(value);
    return grosze === null || grosze < 0 ? "invalid" : grosze;
  };

  async function save(clear: boolean) {
    let body;
    if (clear) {
      body = { month, appointments: null, revenue: null, materialCost: null, payout: null, note: null };
    } else {
      const r = parseMoney(revenue);
      const c = parseMoney(cost);
      const p = parseMoney(payout);
      const n = count.trim() ? Number(count) : null;
      if (r === "invalid" || c === "invalid" || p === "invalid") return toast.error("Niepoprawna kwota");
      if (n !== null && (!Number.isInteger(n) || n < 0)) return toast.error("Niepoprawna liczba zabiegów");
      body = { month, appointments: n, revenue: r, materialCost: c, payout: p, note: note.trim() || null };
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/specialists/${specialistId}/month-settlement`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać");
      toast.success(out.removed ? "Przywrócono wartości standardowe" : "Zapisano rozliczenie niestandardowe");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const rows: { label: string; standard: string; value: string; set: (v: string) => void; hint?: string }[] = [
    { label: "Liczba zabiegów", standard: String(standard.appointments), value: count, set: (v) => setCount(v.replace(/\D/g, "")) },
    { label: "Przychód (zł)", standard: formatPLNFromGrosze(standard.revenue), value: revenue, set: setRevenue },
    { label: "Koszt materiałów (zł)", standard: formatPLNFromGrosze(standard.materialCost), value: cost, set: setCost },
    { label: "Wynagrodzenie specjalisty (zł)", standard: formatPLNFromGrosze(standard.payout), value: payout, set: setPayout },
  ];

  return (
    <Card className="space-y-4 p-4">
      {override ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
          Dla tego miesiąca obowiązuje rozliczenie niestandardowe (zapisane {new Date(override.updatedAt).toLocaleString("pl-PL")}
          {override.updatedBy ? `, ${override.updatedBy}` : ""}).
        </div>
      ) : (
        <div className="text-sm text-zinc-500">Dla tego miesiąca obowiązują wartości standardowe z wizyt.</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="p-2">Pozycja</th>
              <th className="p-2">Standardowo (z wizyt)</th>
              <th className="p-2">Wartość niestandardowa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t">
                <td className="p-2 font-medium">{row.label}</td>
                <td className="p-2 text-zinc-600 dark:text-zinc-300">{row.standard}</td>
                <td className="p-2">
                  <Input
                    className="max-w-[12rem]"
                    inputMode="decimal"
                    placeholder="standardowo"
                    value={row.value}
                    onChange={(e) => row.set(e.target.value)}
                    aria-label={row.label}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ms-note">Notatka (opcjonalnie)</Label>
        <Input id="ms-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="np. ustalenie indywidualne za październik" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving ? "Zapisywanie…" : "Zapisz rozliczenie"}
        </Button>
        {override ? (
          <Button variant="outline" onClick={() => save(true)} disabled={saving}>
            Przywróć wartości standardowe
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
