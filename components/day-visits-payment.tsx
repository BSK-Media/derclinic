"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

type Visit = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  approvalStatus: string;
  serviceName: string;
  specialistName: string;
  due: number;
  paid: number;
  remaining: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const timeFmt = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
const METHODS = [
  { value: "CASH", label: "Gotówka" },
  { value: "CARD", label: "Karta" },
  { value: "TRANSFER", label: "Przelew" },
] as const;

const toInput = (grosze: number) => (grosze / 100).toFixed(2).replace(".", ",");

// Wspólne rozliczenie wszystkich wizyt pacjenta z danego dnia: lista wizyt z możliwością korekty cen, suma do zapłaty
// i jedna płatność wybraną metodą (rozdzielana przez serwer na poszczególne wizyty).
export function DayVisitsPayment({ appointmentId, onChanged }: { appointmentId: string; onChanged?: () => void }) {
  const { data, mutate } = useSWR<{ ok: boolean; visits: Visit[] }>(`/api/admin/appointments/${appointmentId}/day-group`, fetcher);
  const visits = React.useMemo(() => data?.visits ?? [], [data]);
  const [open, setOpen] = React.useState(false);
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [method, setMethod] = React.useState<(typeof METHODS)[number]["value"]>("CASH");
  const [saving, setSaving] = React.useState(false);

  if (!data?.ok || visits.length < 2) return null;

  const totalDue = visits.reduce((sum, v) => sum + v.due, 0);
  const totalRemaining = visits.reduce((sum, v) => sum + v.remaining, 0);

  // Kwota po ewentualnej korekcie ceny (puste/nieparsowalne pole = bez zmiany).
  const edited = (v: Visit) => {
    const raw = prices[v.id];
    if (raw === undefined || raw.trim() === "") return v.due;
    const parsed = parsePLNToGrosze(raw);
    return parsed === null || Number.isNaN(parsed) || parsed < 0 ? v.due : parsed;
  };
  const dueNow = (v: Visit) => Math.max(0, edited(v) - v.paid);
  const payNowTotal = visits.reduce((sum, v) => sum + dueNow(v), 0);

  function openDialog() {
    setPrices(Object.fromEntries(visits.map((v) => [v.id, toInput(v.due)])));
    setOpen(true);
  }

  async function pay() {
    setSaving(true);
    try {
      const items = visits.map((v) => {
        const price = edited(v);
        return price !== v.due ? { appointmentId: v.id, priceFinal: price } : { appointmentId: v.id };
      });
      const res = await fetch(`/api/admin/appointments/${appointmentId}/day-group`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, items }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać płatności");
      toast.success(`Zapisano płatność: ${formatPLNFromGrosze(out.total)} (wizyt: ${out.visits})`);
      setOpen(false);
      await mutate();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-3 border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium">Ten pacjent ma dziś {visits.length} wizyty</div>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Razem {formatPLNFromGrosze(totalDue)}
            {totalRemaining > 0 ? <> · do zapłaty <strong>{formatPLNFromGrosze(totalRemaining)}</strong></> : " · wszystko opłacone"}
          </div>
        </div>
        <Button onClick={openDialog}>Rozlicz razem</Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Wizyty pacjenta z dzisiaj — wspólna płatność</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {visits.map((v) => (
              <div key={v.id} className="grid items-center gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_9rem]">
                <div className="min-w-0 text-sm">
                  <Link href={`/admin/appointments/${v.id}`} className="font-medium hover:underline" onClick={() => setOpen(false)}>
                    {timeFmt.format(new Date(v.startsAt))}–{timeFmt.format(new Date(v.endsAt))} · {v.serviceName}
                  </Link>
                  <div className="text-xs text-zinc-500">
                    {v.specialistName} · wpłacono {formatPLNFromGrosze(v.paid)}
                    {v.id === appointmentId ? " · ta wizyta" : ""}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-zinc-500">Cena (zł)</div>
                  <Input
                    inputMode="decimal"
                    value={prices[v.id] ?? ""}
                    onChange={(e) => setPrices((current) => ({ ...current, [v.id]: e.target.value }))}
                  />
                  <div className="text-[11px] text-zinc-500">Do zapłaty: {formatPLNFromGrosze(dueNow(v))}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div>
              <div className="text-xs text-zinc-500">Do zapłaty razem</div>
              <div className="text-2xl font-semibold">{formatPLNFromGrosze(payNowTotal)}</div>
            </div>
            <label className="text-sm">
              <span className="mr-2 text-zinc-500">Metoda płatności</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number]["value"])}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={pay} disabled={saving}>
              {saving ? "Zapisywanie…" : `Zapłać całość (${formatPLNFromGrosze(payNowTotal)})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
