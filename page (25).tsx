"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100);
}

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data } = useSWR(id ? `/api/admin/products/${id}` : null, fetcher);
  const product = data?.product;

  if (!product) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Ładowanie danych produktu...</div>;
  }

  const totalQty = product.stocks.reduce((sum: number, stock: { quantity: string }) => sum + Number(stock.quantity), 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <Link href="/admin/products" className="hover:underline">Produkty</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-200">{product.name}</span>
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{product.name}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">Firma</div><div className="mt-1 text-xl font-semibold">{product.manufacturer ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">Kategoria</div><div className="mt-1 text-xl font-semibold">{product.catalogCategory ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">Łączny stan</div><div className="mt-1 text-xl font-semibold">{totalQty}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">SKU</div><div className="mt-1 text-xl font-semibold">{product.sku ?? "—"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Parametry produktu</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 text-sm">
            <div><span className="text-slate-500">Jednostka:</span> {product.unit}</div>
            <div><span className="text-slate-500">Cena zakupu:</span> {money(product.purchasePrice)}</div>
            <div><span className="text-slate-500">Cena sprzedaży:</span> {money(product.salePrice)}</div>
            <div><span className="text-slate-500">Aktywny:</span> {product.isActive ? "Tak" : "Nie"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Stany magazynowe</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Magazyn</TableHead><TableHead>Ilość</TableHead></TableRow></TableHeader>
            <TableBody>
              {product.stocks.map((stock: any) => (
                <TableRow key={stock.id}><TableCell>{stock.warehouse.name}</TableCell><TableCell>{Number(stock.quantity)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Serie / partie</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partia</TableHead>
                <TableHead>Termin ważności</TableHead>
                <TableHead>Stan</TableHead>
                <TableHead>Wartość zakupu</TableHead>
                <TableHead>Lokalizacja</TableHead>
                <TableHead>Magazyn</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.lots.map((lot: any) => (
                <TableRow key={lot.id}>
                  <TableCell className="font-medium">{lot.batchNumber}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
