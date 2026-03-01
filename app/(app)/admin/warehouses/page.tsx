"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
type Warehouse = { id: string; name: string; parentId?: string | null };
type Product = { id: string; name: string };

export default function WarehousesPage() {
  const { data, mutate } = useSWR("/api/admin/warehouses", fetcher);
  const warehouses: Warehouse[] = data?.warehouses ?? [];
  const { data: prodData } = useSWR("/api/admin/products", fetcher);
  const products: Product[] = prodData?.products ?? [];

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("__none__");
  const [saving, setSaving] = useState(false);

  const [tProductId, setTProductId] = useState<string>("");
  const [tFrom, setTFrom] = useState<string>("");
  const [tTo, setTTo] = useState<string>("");
  const [tQty, setTQty] = useState<string>("1");
  const [tNote, setTNote] = useState<string>("");
  const [tSaving, setTSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/warehouses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: parentId === "__none__" ? null : parentId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Magazyn dodany");
      setName(""); setParentId("__none__");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function transfer() {
    setTSaving(true);
    try {
      const res = await fetch("/api/admin/stocks/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: tProductId, fromWarehouseId: tFrom, toWarehouseId: tTo, quantity: tQty, note: tNote }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Transfer zapisany");
      setTNote("");
    } finally {
      setTSaving(false);
    }
  }

  const treeLabel = useMemo(() => {
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Magazyny (w tym podmagazyny)</h1>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Dodaj magazyn</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nazwa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Rodzic (opcjonalnie)</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— brak —</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{treeLabel(w.id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={create} disabled={!name || saving}>{saving ? "Zapisywanie..." : "Dodaj"}</Button>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Transfer między magazynami (admin)</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Produkt</Label>
            <Select value={tProductId} onValueChange={setTProductId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Z magazynu</Label>
            <Select value={tFrom} onValueChange={setTFrom}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{treeLabel(w.id)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Do magazynu</Label>
            <Select value={tTo} onValueChange={setTTo}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{treeLabel(w.id)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ilość</Label>
            <Input value={tQty} onChange={(e) => setTQty(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Notatka</Label>
            <Input value={tNote} onChange={(e) => setTNote(e.target.value)} placeholder="opcjonalnie" />
          </div>
        </div>
        <Button onClick={transfer} disabled={tSaving || !tProductId || !tFrom || !tTo || tFrom === tTo}> 
          {tSaving ? "Zapisywanie..." : "Wykonaj transfer"}
        </Button>
        <div className="text-xs text-zinc-500">Transfer tworzy wpis audytu i aktualizuje stany magazynowe.</div>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Lista</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Nazwa</th>
                <th className="p-3">Struktura</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={2}>Brak magazynów.</td></tr>}
              {warehouses.map((w) => (
                <tr key={w.id} className="border-t">
                  <td className="p-3 font-medium">{w.name}</td>
                  <td className="p-3">{treeLabel(w.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
