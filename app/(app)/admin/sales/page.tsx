"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Product = { id: string; name: string; salePrice?: number | null };
type Warehouse = { id: string; name: string };
type Patient = { id: string; name: string };
type Sale = { id: string; createdAt: string; note?: string | null; patient?: Patient | null; items: { id: string; quantity: string; unitPrice?: number | null; total?: number | null; product: Product }[]; payments: { id: string; method: string; amount: number }[] };

export default function AdminSalesPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/sales", fetcher);
  const products: Product[] = data?.products ?? [];
  const warehouses: Warehouse[] = data?.warehouses ?? [];
  const patients: Patient[] = data?.patients ?? [];
  const sales: Sale[] = data?.sales ?? [];

  const [patientId, setPatientId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [note, setNote] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [cart, setCart] = useState<{ productId: string; quantity: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const cartLines = useMemo(() => cart.map((c) => ({
    ...c,
    product: products.find((p) => p.id === c.productId)!,
  })).filter((x) => x.product), [cart, products]);

  const totalGrosze = useMemo(() => {
    let sum = 0;
    for (const l of cartLines) {
      const unit = l.product.salePrice ?? 0;
      const q = parseFloat(l.quantity || "0") || 0;
      sum += Math.round(unit * q);
    }
    return sum;
  }, [cartLines]);

  function addLine() {
    if (!productId) return;
    const q = (parseFloat(qty) || 0);
    if (q <= 0) return;
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.productId === productId);
      if (idx >= 0) {
        const next = [...prev];
        const existing = parseFloat(next[idx].quantity) || 0;
        next[idx] = { productId, quantity: String(existing + q) };
        return next;
      }
      return [...prev, { productId, quantity: String(q) }];
    });
    setProductId("");
    setQty("1");
  }

  async function createSale() {
    if (!warehouseId) return toast.error("Wybierz magazyn");
    if (cart.length === 0) return toast.error("Dodaj produkty do sprzedaży");

    const pay = paymentAmount ? parsePLNToGrosze(paymentAmount) : totalGrosze;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patientId: patientId || null,
          warehouseId,
          items: cart,
          note,
          payment: { method: paymentMethod, amount: pay },
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Sprzedaż zapisana");
      setCart([]);
      setNote("");
      setPaymentAmount("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Sprzedaż kosmetyków</h1>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Nowa sprzedaż</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Klient (opcjonalnie)</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Magazyn</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notatka</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="np. sprzedaż po wizycie" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4 items-end">
          <div className="space-y-2 md:col-span-2">
            <Label>Produkt</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} • {formatPLNFromGrosze(p.salePrice ?? 0)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ilość</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <Button onClick={addLine} disabled={!productId}>Dodaj</Button>
        </div>

        <div className="rounded-xl border">
          <div className="p-3 border-b text-sm font-medium">Koszyk</div>
          <div className="p-3 space-y-2">
            {cartLines.length === 0 && <div className="text-sm text-zinc-500">Brak produktów.</div>}
            {cartLines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.product.name}</div>
                  <div className="text-xs text-zinc-500">{l.quantity} × {formatPLNFromGrosze(l.product.salePrice ?? 0)}</div>
                </div>
                <div className="shrink-0 font-medium">{formatPLNFromGrosze(Math.round((l.product.salePrice ?? 0) * (parseFloat(l.quantity) || 0)))}</div>
              </div>
            ))}
            <div className="pt-2 border-t flex items-center justify-between text-sm">
              <div className="text-zinc-500">Suma</div>
              <div className="font-semibold">{formatPLNFromGrosze(totalGrosze)}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4 items-end">
          <div className="space-y-2">
            <Label>Metoda płatności</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Gotówka</SelectItem>
                <SelectItem value="CARD">Karta</SelectItem>
                <SelectItem value="VOUCHER">Voucher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kwota (PLN, opcjonalnie)</Label>
            <Input value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="domyślnie suma" />
          </div>
          <div className="md:col-span-2">
            <Button className="w-full" onClick={createSale} disabled={saving || cart.length === 0 || !warehouseId}>
              {saving ? "Zapisywanie…" : "Zapisz sprzedaż"}
            </Button>
          </div>
        </div>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Ostatnie sprzedaże</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Klient</th>
                <th className="p-3">Pozycje</th>
                <th className="p-3">Suma</th>
                <th className="p-3">Płatność</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && sales.length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={5}>Brak sprzedaży.</td></tr>}
              {sales.map((s) => {
                const sum = s.items.reduce((acc, it) => acc + (it.total ?? 0), 0);
                const paid = s.payments.reduce((acc, p) => acc + p.amount, 0);
                const lines = s.items.map((it) => `${it.product.name} (${it.quantity})`).join(", ");
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">{new Date(s.createdAt).toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="p-3">{s.patient?.name ?? "—"}</td>
                    <td className="p-3 max-w-[520px] truncate" title={lines}>{lines}</td>
                    <td className="p-3">{formatPLNFromGrosze(sum)}</td>
                    <td className="p-3">{paid ? formatPLNFromGrosze(paid) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
