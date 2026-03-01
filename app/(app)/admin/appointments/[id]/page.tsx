"use client";

import useSWR from "swr";
import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminAppointmentDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, mutate, isLoading } = useSWR(`/api/admin/appointments/${id}`, fetcher);
  const appt = data?.appointment;

  const [status, setStatus] = useState<string>("SCHEDULED");
  const [priceFinal, setPriceFinal] = useState<string>("");
  const [priceEstimate, setPriceEstimate] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [productId, setProductId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");

  const [payMethod, setPayMethod] = useState<string>("CARD");
  const [payAmount, setPayAmount] = useState<string>("");

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  if (!appt) return <div className="p-6 text-sm text-zinc-500">Nie znaleziono.</div>;

  async function save() {
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        priceFinal: priceFinal ? parsePLNToGrosze(priceFinal) : null,
        priceEstimate: priceEstimate ? parsePLNToGrosze(priceEstimate) : null,
        note,
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
    const res = await fetch(`/api/admin/appointments/${id}/consume`, {
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

  async function addPayment() {
    const amount = parsePLNToGrosze(payAmount);
    if (!amount || amount <= 0) return toast.error("Niepoprawna kwota");
    const res = await fetch(`/api/admin/appointments/${id}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: payMethod, amount }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Dodano płatność");
    setPayAmount("");
    mutate();
  }

  const products = data?.products ?? [];
  const warehouses = data?.warehouses ?? [];

  const paymentsSum = (appt.payments ?? []).reduce((a: number, p: any) => a + (p.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wizyta — szczegóły</h1>

      <Card className="p-4 space-y-2">
        <div className="text-sm text-zinc-500">{new Date(appt.startsAt).toLocaleString("pl-PL")} – {new Date(appt.endsAt).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"})}</div>
        <div className="font-medium">{appt.patient.name} • {appt.service.name}</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">Specjalista: {appt.specialist.name} • Status: {appt.status}</div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Status i rozliczenie wizyty</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder={appt.status} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SCHEDULED">SCHEDULED</SelectItem>
                <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                <SelectItem value="CANCELED">CANCELED</SelectItem>
                <SelectItem value="NO_SHOW">NO_SHOW</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cena orientacyjna (PLN)</Label>
            <Input defaultValue={appt.priceEstimate ? (appt.priceEstimate/100).toString() : ""} onChange={(e)=>setPriceEstimate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cena końcowa (PLN)</Label>
            <Input defaultValue={appt.priceFinal ? (appt.priceFinal/100).toString() : ""} onChange={(e)=>setPriceFinal(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-4">
            <Label>Notatka</Label>
            <Input defaultValue={appt.note ?? ""} onChange={(e)=>setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={save}>Zapisz</Button>
        <div className="text-xs text-zinc-500">
          Płatności: {formatPLNFromGrosze(paymentsSum)} • Do zapłaty (wg ceny końcowej): {formatPLNFromGrosze((appt.priceFinal ?? 0) - paymentsSum)}
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Zużycie preparatów (magazyn)</div>

        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Sugerowane preparaty dla tej usługi:
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
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ilość</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-2 flex items-end">
            <Button onClick={addConsumption} disabled={!productId || !warehouseId}>Dodaj zużycie</Button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Produkt</th>
                <th className="p-3">Magazyn</th>
                <th className="p-3">Ilość</th>
                <th className="p-3">Autor</th>
                <th className="p-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {(appt.consumptions ?? []).length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={5}>Brak zużyć.</td></tr>}
              {(appt.consumptions ?? []).map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3">{c.product.name}</td>
                  <td className="p-3">{c.warehouse?.name ?? "—"}</td>
                  <td className="p-3 tabular-nums">{c.quantity}</td>
                  <td className="p-3">{c.createdBy?.name ?? "—"}</td>
                  <td className="p-3">{new Date(c.createdAt).toLocaleString("pl-PL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Płatności</div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Metoda</Label>
            <Select value={payMethod} onValueChange={setPayMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Gotówka</SelectItem>
                <SelectItem value="CARD">Karta</SelectItem>
                <SelectItem value="VOUCHER">Voucher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kwota (PLN)</Label>
            <Input value={payAmount} onChange={(e)=>setPayAmount(e.target.value)} />
          </div>
          <div className="space-y-2 flex items-end">
            <Button onClick={addPayment}>Dodaj płatność</Button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Metoda</th>
                <th className="p-3">Kwota</th>
              </tr>
            </thead>
            <tbody>
              {(appt.payments ?? []).length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={3}>Brak płatności.</td></tr>}
              {(appt.payments ?? []).map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">{new Date(p.createdAt).toLocaleString("pl-PL")}</td>
                  <td className="p-3">{p.method}</td>
                  <td className="p-3">{formatPLNFromGrosze(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
