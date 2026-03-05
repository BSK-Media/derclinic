"use client";

import * as React from "react";
import { Plus, FileText, ArrowRightLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const kpis = [
  { title: "Łączna Wartość Magazynu", value: "PLN 458,200", accent: "green" as const, icon: "↗" },
  { title: "Preparaty Blisko Terminu", value: "4", accent: "orange" as const, icon: "⚠" },
  { title: "Zaległe Zamówienia", value: "2", accent: "orange" as const, icon: "🗓" },
  { title: "Dostępność Ogólna", value: "94%", accent: "blue" as const, icon: "◔" },
];

const items = [
  {
    name: "Juvederm Voluma",
    category: "Toksyna",
    batch: "XY123",
    exp: "28.02.2023",
    qty: 30,
    unitValue: "PLN 458,200",
    location: "Allergan",
    status: "Dostępny",
    statusTone: "green",
    fill: 72,
  },
  {
    name: "Restylane Kysse",
    category: "Wypełniacz",
    batch: "XY133A",
    exp: "27.07.2023",
    qty: 50,
    unitValue: "PLN 18,750",
    location: "Galderma",
    status: "Mało",
    statusTone: "amber",
    fill: 45,
  },
  {
    name: "Dysport",
    category: "Wypełniacz",
    batch: "XY123",
    exp: "28.02.2023",
    qty: 20,
    unitValue: "PLN 18,750",
    location: "Galderma",
    status: "Termin blisko",
    statusTone: "orange",
    fill: 30,
  },
  {
    name: "Etermis 4",
    category: "Toksyna",
    batch: "XY123",
    exp: "27.07.2023",
    qty: 30,
    unitValue: "PLN 8,250",
    location: "Allergan",
    status: "Dostępny",
    statusTone: "green",
    fill: 65,
  },
  {
    name: "Radiesse",
    category: "Toksyna",
    batch: "XY123",
    exp: "28.09.2023",
    qty: 30,
    unitValue: "PLN 8,550",
    location: "Galderma",
    status: "Brak",
    statusTone: "red",
    fill: 10,
  },
  {
    name: "Igły chirurgiczne Becton Dickinson",
    category: "Materiał medyczny",
    batch: "MEDA21T133",
    exp: "23.03.2023",
    qty: 10,
    unitValue: "PLN 5,500",
    location: "Allergan",
    status: "Brak",
    statusTone: "red",
    fill: 10,
  },
];

const orders = [
  { name: "Zamówienie 042", date: "29.03.2023", supplier: "Allergan", status: "Dostępny" },
  { name: "Dostawa 031", date: "29.02.2023", supplier: "Galderma", status: "Dostępny" },
];

const alerts = [
  { title: "Seria: XY123 - Juvederm (wygasa za 3 dni)" },
  { title: "Mała ilość: Restylane" },
];

function Badge({ tone, children }: { tone: "green" | "amber" | "orange" | "red"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
        : tone === "orange"
          ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-200"
          : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200";
  return <span className={"inline-flex rounded-xl px-3 py-1 text-xs font-semibold " + cls}>{children}</span>;
}

export default function InventoryPage() {
  const [filter, setFilter] = React.useState<"Wszystkie" | "Wypełniacze" | "Toksyny" | "Kremy" | "Inne">("Wszystkie");
  const [q, setQ] = React.useState("");

  const [warehouses, setWarehouses] = React.useState(() => [
    { id: "wh-main", name: "Magazyn Główny", location: "Recepcja", note: "Główne stany i dostawy" },
    { id: "wh-1", name: "Gabinet 1", location: "Piętro 1", note: "Preparaty do zabiegów" },
    { id: "wh-2", name: "Gabinet 2", location: "Piętro 2", note: "Materiały eksploatacyjne" },
  ]);
  const [newWh, setNewWh] = React.useState({ name: "", location: "", note: "" });
  const [transfers, setTransfers] = React.useState(() => [
    {
      id: "tr-1",
      date: "Dziś",
      from: "Magazyn Główny",
      to: "Gabinet 1",
      item: "Juvederm Voluma",
      qty: 2,
      note: "Uzupełnienie gabinetu",
    },
  ]);
  const [newTr, setNewTr] = React.useState({
    from: "Magazyn Główny",
    to: "Gabinet 1",
    item: "Juvederm Voluma",
    qty: 1,
    note: "",
  });

  const filtered = items.filter((i) => {
    const byText = (i.name + " " + i.category + " " + i.location).toLowerCase().includes(q.toLowerCase());
    const byFilter =
      filter === "Wszystkie"
        ? true
        : filter === "Wypełniacze"
          ? i.category.toLowerCase().includes("wypeł")
          : filter === "Toksyny"
            ? i.category.toLowerCase().includes("toks")
            : filter === "Kremy"
              ? i.category.toLowerCase().includes("krem")
              : i.category.toLowerCase().includes("inne");
    return byText && byFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Zarządzanie Magazynem - DerClinic</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            Nowe Zamówienie
          </button>
          <button className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
            <FileText className="h-4 w-4" />
            Raport Magazynowy
          </button>
        </div>
      </div>

      {/* Magazyny + przeniesienia */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">Magazyny</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Dodawaj nowe magazyny oraz lokalizacje przechowywania.
              </div>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
                  <Plus className="h-4 w-4" /> Dodaj magazyn
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-lg rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Nowy magazyn</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Nazwa magazynu</Label>
                    <Input
                      value={newWh.name}
                      onChange={(e) => setNewWh((s) => ({ ...s, name: e.target.value }))}
                      placeholder="np. Gabinet 3"
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Lokalizacja</Label>
                    <Input
                      value={newWh.location}
                      onChange={(e) => setNewWh((s) => ({ ...s, location: e.target.value }))}
                      placeholder="np. Piętro 1"
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Opis</Label>
                    <Input
                      value={newWh.note}
                      onChange={(e) => setNewWh((s) => ({ ...s, note: e.target.value }))}
                      placeholder="Krótka notatka (opcjonalnie)"
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      onClick={() => {
                        if (!newWh.name.trim()) return;
                        setWarehouses((w) => [
                          ...w,
                          {
                            id: `wh-${Math.random().toString(16).slice(2)}`,
                            name: newWh.name.trim(),
                            location: newWh.location.trim() || "-",
                            note: newWh.note.trim() || "",
                          },
                        ]);
                        setNewWh({ name: "", location: "", note: "" });
                      }}
                    >
                      Zapisz
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {warehouses.map((w) => (
              <div
                key={w.id}
                className="rounded-2xl border border-white/60 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="font-semibold text-slate-900 dark:text-white">{w.name}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{w.location}</div>
                {w.note ? <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{w.note}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">Przeniesienia</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Przesunięcia między magazynami.</div>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
                  <ArrowRightLeft className="h-4 w-4" /> Przeniesienie
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-lg rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Przesunięcie wewnętrzne</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Z magazynu</Label>
                    <select
                      className="h-10 rounded-2xl border border-slate-200/70 bg-white/60 px-3 text-sm outline-none dark:border-white/10 dark:bg-white/5"
                      value={newTr.from}
                      onChange={(e) => setNewTr((s) => ({ ...s, from: e.target.value }))}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.name}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Do magazynu</Label>
                    <select
                      className="h-10 rounded-2xl border border-slate-200/70 bg-white/60 px-3 text-sm outline-none dark:border-white/10 dark:bg-white/5"
                      value={newTr.to}
                      onChange={(e) => setNewTr((s) => ({ ...s, to: e.target.value }))}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.name}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Produkt / materiał</Label>
                    <Input
                      value={newTr.item}
                      onChange={(e) => setNewTr((s) => ({ ...s, item: e.target.value }))}
                      placeholder="np. Restylane Kysse"
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Ilość</Label>
                    <Input
                      type="number"
                      value={String(newTr.qty)}
                      onChange={(e) => setNewTr((s) => ({ ...s, qty: Math.max(1, Number(e.target.value || 1)) }))}
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Notatka</Label>
                    <Input
                      value={newTr.note}
                      onChange={(e) => setNewTr((s) => ({ ...s, note: e.target.value }))}
                      placeholder="opcjonalnie"
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      onClick={() => {
                        if (!newTr.item.trim()) return;
                        if (newTr.from === newTr.to) return;
                        setTransfers((t) => [
                          {
                            id: `tr-${Math.random().toString(16).slice(2)}`,
                            date: "Dziś",
                            from: newTr.from,
                            to: newTr.to,
                            item: newTr.item.trim(),
                            qty: newTr.qty,
                            note: newTr.note.trim(),
                          },
                          ...t,
                        ]);
                        setNewTr((s) => ({ ...s, note: "" }));
                      }}
                    >
                      Zapisz przeniesienie
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-4 space-y-3">
            {transfers.slice(0, 6).map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-white/60 bg-white/60 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900 dark:text-white">{t.item}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t.date}</div>
                </div>
                <div className="mt-1 text-slate-600 dark:text-slate-300">
                  {t.from} → {t.to} • ilość: <span className="font-semibold">{t.qty}</span>
                </div>
                {t.note ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.note}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.title} className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{k.title}</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{k.value}</div>
              </div>
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                {k.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-base font-semibold">Spis Preparatów i Materiałów</div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              Raport Magazynowy
            </button>
            <button className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              Przesunięcie Wewnętrzne
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex h-10 items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 shadow-sm dark:border-white/10 dark:bg-[#0b1220]/55">
            <span className="text-slate-400">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search..."
              className="w-[220px] bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          {(["Wypełniacze", "Toksyny", "Kremy", "Inne"] as const).map((x) => (
            <button
              key={x}
              onClick={() => setFilter(x)}
              className={
                "rounded-2xl px-3 py-2 text-sm font-semibold " +
                (filter === x ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10")
              }
            >
              {x}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa Preparatu/Materiału</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead>Seria/Partia</TableHead>
                <TableHead>Data Ważności</TableHead>
                <TableHead>Ilość Dostępna</TableHead>
                <TableHead>Wartość Jednostkowa</TableHead>
                <TableHead>Lokalizacja</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.name + r.batch}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-12 rounded bg-slate-200" />
                      <div className="truncate">{r.name}</div>
                    </div>
                  </TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.batch}</TableCell>
                  <TableCell>{r.exp}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-12 text-sm">{r.qty}</div>
                      <div className="h-2.5 w-[90px] rounded-full bg-slate-200 dark:bg-white/10">
                        <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${r.fill}%` }} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{r.unitValue}</TableCell>
                  <TableCell>{r.location}</TableCell>
                  <TableCell>
                    <Badge tone={r.statusTone as any}>{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold">Ostatnie Zamówienia i Dostawy</div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              Dzisiaj
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zamówienie</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Dostawiliur</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.name}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell>{o.date}</TableCell>
                    <TableCell>{o.supplier}</TableCell>
                    <TableCell>
                      <Badge tone="green">{o.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">⋮</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="text-base font-semibold">Szczegółowe Alerty</div>
          <div className="mt-4 space-y-3">
            {alerts.map((a) => (
              <div
                key={a.title}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5"
              >
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{a.title}</div>
                <div className="text-slate-400">›</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
