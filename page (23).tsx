"use client";

import * as React from "react";
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

type Category = "Twarz" | "Ciało" | "Laseroterapia" | "Kosmetologia" | "Archiwum";
type Status = "Aktywny" | "Archiwalny";

type ProcedureRow = {
  id: string;
  code: string;
  name: string;
  category: Exclude<Category, "Archiwum">;
  doctors: { name: string; avatar: string }[];
  mainProduct: { name: string; code: string; image: string };
  altProducts: string;
  status: Status;
  durationMin: number;
  thumb: string;
};

const PROCEDURES: ProcedureRow[] = [
  {
    id: "ZB001",
    code: "ZB001",
    name: "Volumizing Facials",
    category: "Twarz",
    doctors: [
      { name: "Dr. E. Kowalska", avatar: "/demo-avatar-ewa.svg" },
      { name: "Dr. M. Nowak", avatar: "/demo-avatar-ewa.svg" },
    ],
    mainProduct: { name: "Juvederm Voluma", code: "JV001", image: "/demo-product.svg" },
    altProducts: "Radiesse",
    status: "Aktywny",
    durationMin: 60,
    thumb: "/demo-proc.svg",
  },
  {
    id: "ZB002",
    code: "ZB002",
    name: "Lip Augmentation",
    category: "Twarz",
    doctors: [
      { name: "Dr. E. Kowalska", avatar: "/demo-avatar-ewa.svg" },
      { name: "Dr. A. Wiśniewski", avatar: "/demo-avatar-ewa.svg" },
    ],
    mainProduct: { name: "Restylane Kysse", code: "RK002", image: "/demo-product.svg" },
    altProducts: "Juvederm Voluma",
    status: "Aktywny",
    durationMin: 45,
    thumb: "/demo-proc.svg",
  },
  {
    id: "ZB003",
    code: "ZB003",
    name: "Body Contouring",
    category: "Ciało",
    doctors: [{ name: "Dr. J. Lewandowski", avatar: "/demo-avatar-ewa.svg" }],
    mainProduct: { name: "Cream", code: "ET004", image: "/demo-product.svg" },
    altProducts: "Brak",
    status: "Aktywny",
    durationMin: 90,
    thumb: "/demo-proc.svg",
  },
  {
    id: "ZB004",
    code: "ZB004",
    name: "Laser Hair Removal",
    category: "Laseroterapia",
    doctors: [{ name: "Kosmetolog M. Szulc", avatar: "/demo-avatar-ewa.svg" }],
    mainProduct: { name: "Laser, Żel", code: "LZ010", image: "/demo-product.svg" },
    altProducts: "Laser, Żel",
    status: "Aktywny",
    durationMin: 30,
    thumb: "/demo-proc.svg",
  },
  {
    id: "ZB006",
    code: "ZB006",
    name: "Body Contouring",
    category: "Ciało",
    doctors: [{ name: "Dr. J. Lewandowski", avatar: "/demo-avatar-ewa.svg" }],
    mainProduct: { name: "Cream", code: "ET004", image: "/demo-product.svg" },
    altProducts: "Juvederm Voluma",
    status: "Archiwalny",
    durationMin: 60,
    thumb: "/demo-proc.svg",
  },
];

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

export default function ProceduresPage() {
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState<Category>("Twarz");

  const rows = React.useMemo(() => {
    const base = PROCEDURES.filter((r) => {
      const matchText =
        (r.code + " " + r.name + " " + r.mainProduct.name).toLowerCase().includes(q.toLowerCase());
      const matchCat =
        cat === "Archiwum" ? r.status === "Archiwalny" : r.category === cat && r.status !== "Archiwalny";
      return matchText && matchCat;
    });
    return base;
  }, [q, cat]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Katalog Zabiegów - DerClinic
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="rounded-2xl bg-teal-600 px-5 hover:bg-teal-700">+ Nowy Zabieg</Button>
          <Button variant="secondary" className="rounded-2xl bg-teal-100 text-teal-800 hover:bg-teal-200">
            Powiązania Lekarz-Produkt
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Całkowita Liczba Zabiegów" value={72} icon={<span>↗</span>} />
        <StatCard title="Aktywne Procedury" value={58} icon={<span>↗</span>} />
        <StatCard title="Lekarze z Przypisaniami" value={8} icon={<span>👤</span>} />
        <StatCard title="Liczba Produktów w Użyciu" value={25} icon={<span>↗</span>} />
      </div>

      <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-xl">Szczegółowa Lista Zabiegów</CardTitle>
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
            <div className="relative w-full lg:max-w-[420px]">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="rounded-2xl" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                "Twarz",
                "Ciało",
                "Laseroterapia",
                "Kosmetologia",
                "Archiwum",
              ] as Category[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={
                    "rounded-xl px-3 py-1 text-sm font-medium transition " +
                    (cat === c
                      ? "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10")
                  }
                >
                  {c === "Twarz" ? "Zabiegi Twarzy" : c === "Ciało" ? "Zabiegi Ciała" : c}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Kod Zabiegu</TableHead>
                  <TableHead>Nazwa Zabiegu</TableHead>
                  <TableHead>Przypisani Lekarze</TableHead>
                  <TableHead>Główny Produkt</TableHead>
                  <TableHead>Alternatywne Produkty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Średni Czas Trwania</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="align-middle">
                    <TableCell className="font-semibold text-slate-900 dark:text-white">{r.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative h-9 w-12 overflow-hidden rounded-lg bg-slate-200">
                          <img src={r.thumb} alt={r.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="font-medium text-slate-900 dark:text-white">{r.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {r.doctors.map((d) => (
                          <div key={d.name} className="flex items-center gap-2">
                            <div className="relative h-7 w-7 overflow-hidden rounded-full bg-slate-200">
                              <img src={d.avatar} alt={d.name} className="h-full w-full object-cover" />
                            </div>
                            <span className="text-sm text-slate-700 dark:text-slate-200">{d.name}</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative h-7 w-10 overflow-hidden rounded-md bg-slate-200">
                          <img
                            src={r.mainProduct.image}
                            alt={r.mainProduct.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {r.mainProduct.name} ({r.mainProduct.code})
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{r.altProducts}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          "rounded-xl px-3 py-1 " +
                          (r.status === "Aktywny"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800")
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                      {r.durationMin} min.
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
            <CardTitle>Wydajność Zabiegów i Lekarzy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-dashed border-slate-300/70 p-10 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
              Placeholder wykresu (wydajność, liczba zabiegów, itp.)
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <CardHeader>
            <CardTitle>Historia Zmian Przypisań</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Dr. Wiśniewski dodany do Lip Augmentation",
              "Restylane Kysse przypisany do Volumizing Facials (zmieniony z Dysport)",
              "Dodano alternatywny produkt: Radiesse",
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
