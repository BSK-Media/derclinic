"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPLNFromGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Row = {
  specialistId: string;
  name: string;
  payoutPercent: number;
  appointments: number;
  revenue: number;
  materialCost: number;
  profit: number;
  payout: number;
  payoutFromProfit: number;
};

export default function AdminSettlementsPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useSWR(`/api/admin/settlements?month=${month}`, fetcher);
  const rows: Row[] = data?.rows ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.appointments += r.appointments;
        acc.revenue += r.revenue;
        acc.materialCost += r.materialCost;
        acc.profit += r.profit;
        acc.payout += r.payout;
        acc.payoutFromProfit += r.payoutFromProfit;
        return acc;
      },
      { appointments: 0, revenue: 0, materialCost: 0, profit: 0, payout: 0, payoutFromProfit: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Rozliczenia lekarzy</h1>

      <Card className="p-4 space-y-2">
        <div className="font-medium">Zakres</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <div className="text-sm text-zinc-500">Miesiąc</div>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          {isLoading && <div className="text-sm text-zinc-500">Ładowanie…</div>}
        </div>
        <div className="text-xs text-zinc-500">
          Rozliczenia liczą **wizyty COMPLETED** w wybranym miesiącu. Koszt materiałów = suma zużyć × cena zakupu produktu.
          Wypłata jest pokazana w dwóch wariantach: od przychodu oraz od zysku (przychód − materiały).
        </div>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Zestawienie</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Specjalista</th>
                <th className="p-3">Wizyty</th>
                <th className="p-3">Przychód</th>
                <th className="p-3">Materiały</th>
                <th className="p-3">Zysk</th>
                <th className="p-3">% </th>
                <th className="p-3">Wypłata (od przychodu)</th>
                <th className="p-3">Wypłata (od zysku)</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && rows.length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={8}>Brak danych.</td></tr>}
              {rows.map((r) => (
                <tr key={r.specialistId} className="border-t">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3">{r.appointments}</td>
                  <td className="p-3">{formatPLNFromGrosze(r.revenue)}</td>
                  <td className="p-3">{formatPLNFromGrosze(r.materialCost)}</td>
                  <td className="p-3">{formatPLNFromGrosze(r.profit)}</td>
                  <td className="p-3">{r.payoutPercent}%</td>
                  <td className="p-3 font-semibold">{formatPLNFromGrosze(r.payout)}</td>
                  <td className="p-3 font-semibold">{formatPLNFromGrosze(r.payoutFromProfit)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t bg-zinc-50 dark:bg-zinc-900">
                  <td className="p-3 font-medium">Suma</td>
                  <td className="p-3">{totals.appointments}</td>
                  <td className="p-3">{formatPLNFromGrosze(totals.revenue)}</td>
                  <td className="p-3">{formatPLNFromGrosze(totals.materialCost)}</td>
                  <td className="p-3">{formatPLNFromGrosze(totals.profit)}</td>
                  <td className="p-3">—</td>
                  <td className="p-3 font-semibold">{formatPLNFromGrosze(totals.payout)}</td>
                  <td className="p-3 font-semibold">{formatPLNFromGrosze(totals.payoutFromProfit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
