"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Warehouse = { id: string; name: string; parentId?: string | null };
type Stock = { id: string; productId: string; warehouseId: string; quantity: string };
type Product = { id: string; name: string; category: string; sku?: string | null; unit: string; purchasePrice?: number | null; salePrice?: number | null; isActive: boolean; stocks: Stock[] };

export default function ProductsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/products", fetcher);
  const products: Product[] = data?.products ?? [];
  const warehouses: Warehouse[] = data?.warehouses ?? [];

  const [category, setCategory] = useState("PREPARATION");
  const [unit, setUnit] = useState("UNIT");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [saving, setSaving] = useState(false);

  const warehouseLabel = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w] as const));
    const label = (id: string) => {
      const parts: string[] = [];
      let cur = byId.get(id);
      let guard = 0;
      while (cur && guard++ < 8) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return parts.join(" / ");
    };
    return label;
  }, [warehouses]);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          name,
          sku,
          unit,
          purchasePrice: purchasePrice ? parsePLNToGrosze(purchasePrice) : null,
          salePrice: salePrice ? parsePLNToGrosze(salePrice) : null,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Produkt dodany");
      setName(""); setSku(""); setPurchasePrice(""); setSalePrice("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function adjust(productId: string, warehouseId: string) {
    const deltaStr = prompt("Podaj zmianę stanu (np. 5 albo -2.5)");
    if (!deltaStr) return;
    const delta = Number(deltaStr.replace(",", "."));
    if (!Number.isFinite(delta)) return toast.error("Niepoprawna liczba");
    const res = await fetch("/api/admin/stocks/adjust", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, warehouseId, delta }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Zmieniono stan");
    mutate();
  }

  const qty = (p: Product, wId: string) => {
    const s = p.stocks.find((x) => x.warehouseId === wId);
    return s ? s.quantity : "0";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Produkty (magazyn)</h1>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Dodaj produkt</div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Kategoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PREPARATION">Preparat zabiegowy</SelectItem>
                <SelectItem value="COSMETIC">Kosmetyk do sprzedaży</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Jednostka</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UNIT">szt.</SelectItem>
                <SelectItem value="ML">ml</SelectItem>
                <SelectItem value="AMPULE">ampułki</SelectItem>
                <SelectItem value="BOTOX_UNIT">jednostki botoksu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>SKU (opcjonalnie)</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Nazwa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cena zakupu (PLN)</Label>
            <Input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="np. 123.45" />
          </div>
          <div className="space-y-2">
            <Label>Cena sprzedaży (PLN)</Label>
            <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="np. 199.00" />
          </div>
        </div>
        <Button onClick={create} disabled={!name || saving}>{saving ? "Zapisywanie..." : "Dodaj"}</Button>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Lista + stany magazynowe</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3 min-w-[260px]">Produkt</th>
                <th className="p-3">Kategoria</th>
                <th className="p-3">Jednostka</th>
                <th className="p-3">Zakup</th>
                <th className="p-3">Sprzedaż</th>
                {warehouses.map((w) => (
                  <th key={w.id} className="p-3 min-w-[160px]">{warehouseLabel(w.id)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td className="p-3 text-zinc-500" colSpan={6 + warehouses.length}>Ładowanie...</td></tr>}
              {!isLoading && products.length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={6 + warehouses.length}>Brak produktów.</td></tr>}
              {products.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.category}</td>
                  <td className="p-3">{p.unit}</td>
                  <td className="p-3">{formatPLNFromGrosze(p.purchasePrice)}</td>
                  <td className="p-3">{formatPLNFromGrosze(p.salePrice)}</td>
                  {warehouses.map((w) => (
                    <td key={w.id} className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{qty(p, w.id)}</span>
                        <Button size="sm" variant="outline" onClick={() => adjust(p.id, w.id)}>Korekta</Button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-zinc-500">
        Korekty stanów zapisują się w historii zużyć (audyt). Możesz dodać osobne akcje: przyjęcie, rozchód, transfer — to jest gotowa baza pod rozbudowę.
      </div>
    </div>
  );
}
