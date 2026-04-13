"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Product = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  catalogCategory: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  isActive: boolean;
  lots: Array<{ id: string; quantity: string; expiryDate: string; status: string | null }>;
  stocks: Array<{ id: string; quantity: string }>;
};

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100);
}

function qtyTotal(stocks: Product["stocks"]) {
  return stocks.reduce((sum, item) => sum + Number(item.quantity), 0);
}

function StatCard({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
      <CardContent className="p-5">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function ProductsPage() {
  const { data } = useSWR("/api/admin/products", fetcher);
  const products: Product[] = data?.products ?? [];
  const [q, setQ] = React.useState("");
  const [manufacturer, setManufacturer] = React.useState("Wszystkie");

  const manufacturers = React.useMemo(() => ["Wszystkie", ...Array.from(new Set(products.map((p) => p.manufacturer).filter(Boolean) as string[]))], [products]);
  const rows = React.useMemo(() => products.filter((p) => {
    const hay = `${p.sku ?? ""} ${p.name} ${p.manufacturer ?? ""} ${p.catalogCategory ?? ""}`.toLowerCase();
    const matchQ = hay.includes(q.toLowerCase());
    const matchM = manufacturer === "Wszystkie" || p.manufacturer === manufacturer;
    return matchQ && matchM;
  }), [products, q, manufacturer]);

  const lowStockCount = products.filter((p) => qtyTotal(p.stocks) <= 2).length;
  const totalValue = products.reduce((sum, p) => sum + ((p.purchasePrice ?? 0) * qtyTotal(p.stocks)), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Katalog produktów</h1>
        <div className="text-sm text-slate-500 dark:text-slate-400">Źródło: baza produktów z seedera magazynu kliniki</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Łączna liczba produktów" value={products.length} />
        <StatCard title="Firmy / producenci" value={manufacturers.length - 1} />
        <StatCard title="Produkty z niskim stanem" value={lowStockCount} />
        <StatCard title="Szacowana wartość zakupu" value={money(totalValue)} />
      </div>

      <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Lista produktów</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-[420px]"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po nazwie, SKU, firmie..." className="rounded-2xl" /></div>
            <div className="flex flex-wrap items-center gap-2">
              {manufacturers.map((m) => (
                <button key={m} type="button" onClick={() => setManufacturer(m)} className={"rounded-xl px-3 py-1 text-sm font-medium transition " + (manufacturer === m ? "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10")}>{m}</button>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Stan</TableHead>
                  <TableHead>Cena zakupu</TableHead>
                  <TableHead>Cena sprzedaży</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const totalQty = qtyTotal(p.stocks);
                  const shortExpiry = p.lots.some((lot) => new Date(lot.expiryDate).getTime() - Date.now() <= 1000 * 60 * 60 * 24 * 120);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold">{p.sku ?? p.id.slice(0, 8)}</TableCell>
                      <TableCell><Link href={`/admin/products/${p.id}`} className="font-medium text-slate-900 hover:underline dark:text-white">{p.name}</Link></TableCell>
                      <TableCell>{p.manufacturer ?? "—"}</TableCell>
                      <TableCell>{p.catalogCategory ?? "—"}</TableCell>
                      <TableCell>{totalQty}</TableCell>
                      <TableCell>{money(p.purchasePrice)}</TableCell>
                      <TableCell>{money(p.salePrice)}</TableCell>
                      <TableCell>
                        <Badge className={totalQty <= 2 ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" : shortExpiry ? "bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-200" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200"}>
                          {totalQty <= 2 ? "Niski stan" : shortExpiry ? "Krótki termin" : "Aktywny"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
