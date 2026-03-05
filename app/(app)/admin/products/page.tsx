"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProductType = "Zabiegowe" | "Konsumpcyjne" | "Detaliczne" | "Archiwum";
type ProductStatus = "Aktywny" | "Archiwalny";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  supplier: string;
  buyPrice: number;
  retailPrice: number;
  status: ProductStatus;
  procedures: string[];
  thumb: string;
  type: Exclude<ProductType, "Archiwum">;
};

const PRODUCTS: ProductRow[] = [
  {
    id: "JV001",
    code: "JV001",
    name: "Juvederm Voluma",
    supplier: "Allergan",
    buyPrice: 458_800,
    retailPrice: 30_500,
    status: "Aktywny",
    procedures: ["Volumizing Facials"],
    thumb: "/demo-product.svg",
    type: "Zabiegowe",
  },
  {
    id: "RK002",
    code: "RK002",
    name: "Restylane Kysse",
    supplier: "Galderma",
    buyPrice: 138_000,
    retailPrice: 18_750,
    status: "Aktywny",
    procedures: ["Lip Augmentation"],
    thumb: "/demo-product.svg",
    type: "Zabiegowe",
  },
  {
    id: "DV003",
    code: "DV003",
    name: "Dysport",
    supplier: "Allergan",
    buyPrice: 18_750,
    retailPrice: 18_700,
    status: "Aktywny",
    procedures: ["Volumizing Facials"],
    thumb: "/demo-product.svg",
    type: "Zabiegowe",
  },
  {
    id: "ET004",
    code: "ET004",
    name: "Etermis 4",
    supplier: "Allergan",
    buyPrice: 21_200,
    retailPrice: 8_250,
    status: "Aktywny",
    procedures: ["Volumizing Facials", "Etermisse"],
    thumb: "/demo-product.svg",
    type: "Zabiegowe",
  },
  {
    id: "RA006",
    code: "RA006",
    name: "Radiesse",
    supplier: "Galderma",
    buyPrice: 28_550,
    retailPrice: 30_550,
    status: "Archiwalny",
    procedures: ["Lip Augmentation"],
    thumb: "/demo-product.svg",
    type: "Zabiegowe",
  },
  {
    id: "RK007",
    code: "RK007",
    name: "Igły chirurgiczne Becton Dickinson",
    supplier: "MEDA21T133",
    buyPrice: 23_500,
    retailPrice: 10_000,
    status: "Archiwalny",
    procedures: ["Lip Augmentation"],
    thumb: "/demo-product.svg",
    type: "Konsumpcyjne",
  },
];

function fmt(n: number) {
  return new Intl.NumberFormat("pl-PL").format(n);
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
          </div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductsPage() {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<ProductType>("Zabiegowe");

  const rows = React.useMemo(() => {
    const t = type;
    return PRODUCTS.filter((p) => {
      const matchType = t === "Archiwum" ? p.status === "Archiwalny" : p.type === t && p.status !== "Archiwalny";
      const matchText = (p.code + " " + p.name + " " + p.supplier).toLowerCase().includes(q.toLowerCase());
      return matchType && matchText;
    });
  }, [q, type]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Katalog Produktów - DerClinic
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="rounded-2xl bg-teal-600 px-5 hover:bg-teal-700">+ Nowy Produkt</Button>
          <Button variant="secondary" className="rounded-2xl bg-teal-100 text-teal-800 hover:bg-teal-200">
            Eksportuj Katalog
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Całkowita Liczba Produktów" value={85} icon={<span>↗</span>} />
        <StatCard title="Aktywne Preparaty" value={62} icon={<span>↗</span>} />
        <StatCard title="Archiwum/Nieaktywne" value={23} icon={<span>⚠</span>} />
        <StatCard title="Powiązane Usługi" value={48} icon={<span>👥</span>} />
      </div>

      <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-xl">Szczegółowa Lista Produktów</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="rounded-2xl bg-teal-100 text-teal-800 hover:bg-teal-200">
                Raport Magazynowy
              </Button>
              <Button variant="secondary" className="rounded-2xl bg-teal-100 text-teal-800 hover:bg-teal-200">
                Przesunięcie Wewnętrzne
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-[420px]">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="rounded-2xl" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["Zabiegowe", "Konsumpcyjne", "Detaliczne", "Archiwum"] as ProductType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={
                    "rounded-xl px-3 py-1 text-sm font-medium transition " +
                    (type === t
                      ? "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Kod Produktu</TableHead>
                  <TableHead>Nazwa Produktu</TableHead>
                  <TableHead>Główny Dostawca</TableHead>
                  <TableHead>Cena Zakupu (PLN)</TableHead>
                  <TableHead>Cena Detaliczna (PLN)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Powiązane Procedury</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id} className="align-middle">
                    <TableCell className="font-semibold text-slate-900 dark:text-white">{p.code}</TableCell>
                    <TableCell>
                      <Link href={`/admin/products/${p.id}`} className="group flex items-center gap-3">
                        <div className="relative h-9 w-12 overflow-hidden rounded-lg bg-slate-200">
                          <img src={p.thumb} alt={p.name} className="h-full w-full object-cover" />
                        </div>
                        <span className="font-medium text-slate-900 group-hover:underline dark:text-white">{p.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{p.supplier}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{fmt(p.buyPrice)}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{fmt(p.retailPrice)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          "rounded-xl px-3 py-1 " +
                          (p.status === "Aktywny" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {p.procedures.map((t) => (
                          <span
                            key={t}
                            className="rounded-xl bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <CardHeader>
            <CardTitle>Powiązane Procedury i Usługi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Najczęściej używane procedury</TableHead>
                    <TableHead>Główny produkt użyty</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { proc: "Volumizing Facials", prod: "Juvederm Voluma – Toksyna – Volumizing Facials" },
                    { proc: "Powiązane Procedury i Usługi", prod: "Restylane Kysse – Cena Zakupu – Restylane Kysse" },
                  ].map((r) => (
                    <TableRow key={r.proc}>
                      <TableCell className="font-medium text-slate-900 dark:text-white">{r.proc}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-200">{r.prod}</TableCell>
                      <TableCell className="text-right text-slate-400">⋮</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <CardHeader>
            <CardTitle>Historia Aktualizacji Cen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Juvederm Voluma - Cena Zakupu zmieniona 3 dni temu",
              "Dysport - Nowa Cena Detaliczna",
              "Restylane Kysse - Aktualizacja marży",
            ].map((t) => (
              <div
                key={t}
                className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
              >
                <span>{t}</span>
                <span className="text-slate-400">›</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
