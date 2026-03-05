"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <Link href="/admin/products" className="hover:underline">
              Produkty
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-700 dark:text-slate-200">{id}</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Produkt: {id}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button className="rounded-2xl bg-teal-600 px-5 hover:bg-teal-700">Dodaj do magazynu</Button>
          <Button variant="secondary" className="rounded-2xl bg-teal-100 text-teal-800 hover:bg-teal-200">
            Edytuj
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <CardHeader>
            <CardTitle>Szczegóły produktu</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nazwa</Label>
              <Input defaultValue="Juvederm Voluma" className="rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Kod</Label>
              <Input defaultValue={id} className="rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Dostawca</Label>
              <Input defaultValue="Allergan" className="rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div>
                <Badge variant="secondary" className="rounded-xl bg-emerald-100 px-3 py-1 text-emerald-800">
                  Aktywny
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cena zakupu (PLN)</Label>
              <Input defaultValue="458 800" className="rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Cena detaliczna (PLN)</Label>
              <Input defaultValue="30 500" className="rounded-2xl" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Opis</Label>
              <textarea
                className="min-h-[120px] w-full rounded-2xl border border-slate-200/70 bg-white/60 p-3 text-sm text-slate-800 outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                defaultValue="Placeholder opisu produktu (skład, wskazania, przeciwwskazania, itp.)."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <CardHeader>
            <CardTitle>Dostępność</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { w: "Magazyn Główny", qty: 30, s: "Dostępny" },
              { w: "Gabinet 1", qty: 8, s: "Mało" },
              { w: "Gabinet 2", qty: 0, s: "Brak" },
            ].map((r) => (
              <div
                key={r.w}
                className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5"
              >
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">{r.w}</div>
                  <div className="text-slate-500 dark:text-slate-400">Ilość: {r.qty}</div>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    "rounded-xl px-3 py-1 " +
                    (r.s === "Dostępny"
                      ? "bg-emerald-100 text-emerald-800"
                      : r.s === "Mało"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800")
                  }
                >
                  {r.s}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <CardHeader>
          <CardTitle>Historia ruchów magazynowych</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Operacja</TableHead>
                  <TableHead>Magazyn</TableHead>
                  <TableHead className="text-right">Ilość</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { d: "Dziś", op: "Przyjęcie", w: "Magazyn Główny", q: "+10" },
                  { d: "Wczoraj", op: "Przesunięcie", w: "Gabinet 1", q: "-2" },
                  { d: "3 dni temu", op: "Zużycie", w: "Gabinet 2", q: "-1" },
                ].map((r) => (
                  <TableRow key={r.d + r.op}>
                    <TableCell className="text-slate-700 dark:text-slate-200">{r.d}</TableCell>
                    <TableCell className="font-medium text-slate-900 dark:text-white">{r.op}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{r.w}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900 dark:text-white">{r.q}</TableCell>
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
