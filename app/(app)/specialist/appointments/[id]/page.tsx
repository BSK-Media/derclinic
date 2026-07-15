"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Etykiety jednostek — jednostkę produktu ustala administrator w karcie produktu
const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  AMPULE: "ampułka",
  BOTOX_UNIT: "jedn. botox",
};
const unitLabel = (u?: string | null) => (u ? UNIT_LABELS[u] ?? u : "—");

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Zaplanowana",
  COMPLETED: "Zakończona",
  CANCELED: "Odwołana",
  NO_SHOW: "Nieobecność pacjenta",
};
const statusLabel = (s?: string | null) => (s ? STATUS_LABELS[s] ?? s : "—");

// Date -> wartość dla <input type="datetime-local"> w strefie lokalnej
function toLocalInput(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SpecialistAppointmentDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, mutate, isLoading } = useSWR(`/api/specialist/appointments/${id}`, fetcher);
  const appt = data?.appointment;

  const [status, setStatus] = useState<string>("SCHEDULED");
  const [priceFinal, setPriceFinal] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");

  const [productId, setProductId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [consumptionEdits, setConsumptionEdits] = useState<Record<string, string>>({});
  const [consumptionSavingId, setConsumptionSavingId] = useState<string | null>(null);

  // Jedyny przypisany magazyn wybiera się automatycznie (hook musi być przed wczesnymi returnami)
  const warehousesForEffect = data?.warehouses ?? [];
  useEffect(() => {
    if (warehousesForEffect.length === 1 && warehouseId !== warehousesForEffect[0].id) {
      setWarehouseId(warehousesForEffect[0].id);
    }
  }, [warehousesForEffect, warehouseId]);

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  if (!appt) return <div className="p-6 text-sm text-zinc-500">Nie znaleziono.</div>;

  async function save() {
    const res = await fetch(`/api/specialist/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        priceFinal: priceFinal ? parsePLNToGrosze(priceFinal) : null,
        note,
        ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
        ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Zapisano");
    mutate();
  }

  async function addConsumption() {
    const q = Number(qty.replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) return toast.error("Niepoprawna ilość");
    const res = await fetch(`/api/specialist/appointments/${id}/consume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, warehouseId, quantity: q, kind: "APPOINTMENT" }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Dodano zużycie");
    setQty("1");
    mutate();
  }

  async function updateConsumption(consumptionId: string) {
    const raw = (consumptionEdits[consumptionId] ?? "").replace(",", ".");
    const q = Number(raw);
    if (!Number.isFinite(q) || q <= 0) return toast.error("Niepoprawna ilość");
    setConsumptionSavingId(consumptionId);
    try {
      const res = await fetch(`/api/specialist/appointments/${id}/consume`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumptionId, quantity: q }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Zapisano ilość — stan magazynu skorygowany");
      setConsumptionEdits((m) => {
        const n = { ...m };
        delete n[consumptionId];
        return n;
      });
      mutate();
    } finally {
      setConsumptionSavingId(null);
    }
  }

  async function deleteConsumption(consumptionId: string) {
    if (!window.confirm("Usunąć to zużycie? Ilość wróci na stan magazynu.")) return;
    setConsumptionSavingId(consumptionId);
    try {
      const res = await fetch(
        `/api/specialist/appointments/${id}/consume?consumptionId=${encodeURIComponent(consumptionId)}`,
        { method: "DELETE" },
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Usunięto zużycie — ilość wróciła na stan");
      mutate();
    } finally {
      setConsumptionSavingId(null);
    }
  }

  const products = data?.products ?? [];
  const warehouses = data?.warehouses ?? [];
  const paymentsSum = (appt.payments ?? []).reduce((a: number, p: any) => a + (p.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wizyta — szczegóły</h1>

      <Card className="p-4 space-y-2">
        <div className="text-sm text-zinc-500">{new Date(appt.startsAt).toLocaleString("pl-PL")} – {new Date(appt.endsAt).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"})}</div>
        <div className="font-medium">{appt.patient.name} • {appt.customServiceName || appt.service.name}</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">Status: {statusLabel(appt.status)}</div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Wykonanie i opis</div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Rozpoczęcie zabiegu</Label>
            <Input
              type="datetime-local"
              defaultValue={toLocalInput(appt.startsAt)}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Zakończenie zabiegu</Label>
            <Input
              type="datetime-local"
              defaultValue={toLocalInput(appt.endsAt)}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder={statusLabel(appt.status)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SCHEDULED">Zaplanowana</SelectItem>
                <SelectItem value="COMPLETED">Zakończona</SelectItem>
                <SelectItem value="CANCELED">Odwołana</SelectItem>
                <SelectItem value="NO_SHOW">Nieobecność pacjenta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cena końcowa (PLN)</Label>
            <Input defaultValue={appt.priceFinal ? (appt.priceFinal/100).toString() : ""} onChange={(e)=>setPriceFinal(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Notatka (opis zabiegu)</Label>
            <Input defaultValue={appt.note ?? ""} onChange={(e)=>setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={save}>Zapisz</Button>
        <div className="text-xs text-zinc-500">Płatności (podgląd): {formatPLNFromGrosze(paymentsSum)}.</div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Zużycie preparatów</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Sugerowane preparaty:
          <div className="mt-2 flex flex-wrap gap-2">
            {(appt.service?.suggestedProducts ?? []).map((sp: any) => (
              <span key={sp.id} className="text-xs rounded-full border px-3 py-1 bg-zinc-50 dark:bg-zinc-900">
                {sp.product.name} • {sp.quantity} {sp.unit}
              </span>
            ))}
            {(appt.service?.suggestedProducts ?? []).length === 0 && <span className="text-xs text-zinc-500">—</span>}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Produkt</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Magazyn</Label>
            {warehouses.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Brak przypisanego magazynu — poproś administratora o przypisanie.
              </div>
            ) : warehouses.length === 1 ? (
              <div className="flex h-10 items-center rounded-xl border bg-zinc-50 px-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                {warehouses[0].name}
              </div>
            ) : (
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Ilość</Label>
            <div className="flex items-center gap-2">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} />
              <div
                className="flex h-10 min-w-[72px] items-center justify-center rounded-xl border bg-zinc-50 px-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                title="Jednostka ustalana przez administratora w karcie produktu"
              >
                {unitLabel(products.find((p: any) => p.id === productId)?.unit)}
              </div>
            </div>
          </div>
          <div className="space-y-2 flex items-end">
            <Button onClick={addConsumption} disabled={!productId || !warehouseId}>Dodaj</Button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Produkt</th>
                <th className="p-3">Magazyn</th>
                <th className="p-3 w-40">Ilość</th>
                <th className="p-3">Data</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-48">Działania</th>
              </tr>
            </thead>
            <tbody>
              {(appt.consumptions ?? []).length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={6}>Brak zużyć.</td></tr>}
              {(appt.consumptions ?? []).map((c: any) => {
                const current = String(c.quantity);
                const value = consumptionEdits[c.id] ?? current;
                const dirty = consumptionEdits[c.id] !== undefined && consumptionEdits[c.id] !== current;
                const busy = consumptionSavingId === c.id;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="p-3">{c.product.name}</td>
                    <td className="p-3">{c.warehouse?.name ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-20"
                          value={value}
                          onChange={(e) => setConsumptionEdits((m) => ({ ...m, [c.id]: e.target.value }))}
                        />
                        <span className="text-xs text-zinc-500">{unitLabel(c.product.unit)}</span>
                      </div>
                      {c.suggestedQuantity ? (
                        <div className="mt-1 text-xs text-zinc-500">sugerowano: {c.suggestedQuantity}</div>
                      ) : null}
                    </td>
                    <td className="p-3">{new Date(c.createdAt).toLocaleString("pl-PL")}</td>
                    <td className="p-3">
                      {c.status === "PENDING" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                          Czeka na akceptację admina
                        </span>
                      )}
                      {c.status === "APPLIED" && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                          Zaakceptowano
                        </span>
                      )}
                      {c.status === "REJECTED" && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/10 dark:text-red-300">
                          Odrzucono
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateConsumption(c.id)} disabled={busy || !dirty}>
                          {busy ? "..." : "Zapisz"}
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteConsumption(c.id)} disabled={busy}>
                          Usuń
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
