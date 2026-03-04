"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardPayload } from "@/lib/demo-dashboard";
import { Bar, BarChart, CartesianGrid, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { ChevronDown, Plus } from "lucide-react";

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 flex items-center justify-center text-xs font-semibold">
      {initials}
    </div>
  );
}

function KpiIcon({ kind }: { kind: string }) {
  const base = "h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold";
  if (kind === "alerts") return <div className={base + " bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"}>!</div>;
  if (kind === "patients") return <div className={base + " bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200"}>👥</div>;
  if (kind === "revenue") return <div className={base + " bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}>↗</div>;
  return <div className={base + " bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}>↗</div>;
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div className="h-2 rounded-full bg-teal-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function AdminDashboardUX() {
  const [data, setData] = React.useState<DashboardPayload | null>(null);

  React.useEffect(() => {
    let mounted = true;
    fetch("/api/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => mounted && setData(j))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const clinicName = data?.clinicName ?? "Estetika Clinique";
  const kpis = data?.kpis ?? [];
  const revenue30d = data?.revenue30d ?? [];
  const mix = data?.procedureMix ?? [];
  const popular = data?.popularProcedures ?? [];
  const upcoming = data?.upcomingToday ?? [];
  const stock = data?.stockStatus ?? [];

  return (
    <div className="min-h-[calc(100vh-0px)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-2xl font-semibold tracking-tight">Panel Zarządzania Kliniką - {clinicName}</div>
        <Button className="bg-teal-500 hover:bg-teal-600 text-white">
          <Plus className="mr-2 h-4 w-4" /> Panel zozdaria
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.title} className="shadow-sm">
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">{k.title}</div>
                <div className="mt-1 text-3xl font-semibold">{k.value}</div>
                <div className="mt-1 text-sm text-emerald-600 dark:text-emerald-300">
                  {k.deltaValue} {k.deltaLabel ? <span className="text-zinc-500 dark:text-zinc-400">{k.deltaLabel}</span> : null}
                </div>
              </div>
              <KpiIcon kind={k.icon} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Przychód i Wizyty (Ostatnie 30 Dni)</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">30 dni</span>
              <span className="text-zinc-500 dark:text-zinc-400">7 dni</span>
              <span className="text-zinc-500 dark:text-zinc-400">Miesiąc</span>
              <span className="text-zinc-500 dark:text-zinc-400">Rok</span>
            </div>
          </CardHeader>
          <CardContent className="h-[280px] p-4 pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue30d}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="revenue" radius={[6, 6, 0, 0]} fill="#2dd4bf" />
                <Line yAxisId="right" type="monotone" dataKey="visits" stroke="#22c55e" strokeWidth={2} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Struktura Zabiegów</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] p-4 pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Pie data={mix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {mix.map((_, idx) => (
                    <Cell key={idx} fill={["#60a5fa", "#34d399", "#22c55e", "#a1a1aa"][idx % 4]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1 text-sm">
              {mix.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-zinc-600 dark:text-zinc-300">
                  <span>{m.name}</span>
                  <span className="font-medium">{m.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Nadchodzące Wizyty Dzisiaj</CardTitle>
            <span className="rounded-md border px-2 py-1 text-xs text-teal-700 border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">Dzisiaj</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pacjent</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Procedur</TableHead>
                  <TableHead className="text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((u, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.patient} />
                        <div className="font-medium">{u.patient}</div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{u.time}</TableCell>
                    <TableCell>{u.procedure}</TableCell>
                    <TableCell className="text-right text-zinc-400">⋮</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Najpopularniejsze Zabiegi</CardTitle>
              <Button variant="outline" className="h-8 px-2 text-xs">
                Zabiegiów <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zabiegi</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead className="text-right">Przychód</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {popular.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.volumePct}%</TableCell>
                      <TableCell className="text-right">PLN {p.revenue.toLocaleString("pl-PL")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Status Magazynu Preparatów</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stock.map((s) => (
                <div key={s.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700 dark:text-zinc-200">{s.name}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">{s.pct}%</span>
                  </div>
                  <Progress value={s.pct} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}