"use client";

import * as React from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100);
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

export default function InventoryPage() {
  const { data } = useSWR("/api/admin/inventory", fetcher);
  const lots = data?.lots ?? [];
  const kpis = data?.kpis;
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => lots.filter((lot: any) => (`${lot.product.name} ${lot.product.manufacturer ?? ""} ${lot.batchNumber} ${lot.location ?? ""} ${lot.warehouse.name}`).toLowerCase().includes(q.toLowerCase())), [lots, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Magazyn kliniki</h1>
          <div className="text-sm text-slate-500 dark:text-slate-400">Lokalizacja robocza wszystkich partii: Grodzisk Mazowiecki</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Łączna wartość zakupu" value={money(kpis?.totalValue)} />
        <StatCard title="Liczba produktów" value={data?.productsCount ?? 0} />
        <StatCard title="Niski stan" value={kpis?.lowStockCount ?? 0} />
        <StatCard title="Krótki termin" value={kpis?.shortExpiryCount ?? 0} />
      </div>

      <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <CardHeader>
          <CardTitle>Partie magazynowe</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 max-w-md">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po nazwie, firmie, partii, magazynie..." className="rounded-2xl" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Partia</TableHead>
                  <TableHead>Termin ważności</TableHead>
                  <TableHead>Stan</TableHead>
                  <TableHead>Wartość / szt.</TableHead>
                  <TableHead>Lokalizacja</TableHead>
                  <TableHead>Magazyn</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lot: any) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.product.name}</TableCell>
                    <TableCell>{lot.product.manufacturer ?? "—"}</TableCell>
                    <TableCell>{lot.product.catalogCategory ?? "—"}</TableCell>
                    <TableCell>{lot.batchNumber}</TableCell>
                    <TableCell>{new Date(lot.expiryDate).toLocaleDateString("pl-PL")}</TableCell>
                    <TableCell>{Number(lot.quantity)}</TableCell>
                    <TableCell>{money(lot.purchasePrice)}</TableCell>
                    <TableCell>{lot.location ?? "—"}</TableCell>
                    <TableCell>{lot.warehouse.name}</TableCell>
                    <TableCell>{lot.status ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
