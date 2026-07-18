"use client";

import * as React from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { Plus, TrendingUp, UserPlus, AlertTriangle, Users, ChevronDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPLNFromGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Period = "30d" | "7d" | "month" | "year";

function StatCard({
  title,
  value,
  sub,
  accent,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  sub: string;
  accent: "green" | "blue" | "orange";
  icon: React.ReactNode;
}) {
  const pill =
    accent === "green"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
      : accent === "blue"
        ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"
        : "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300";

  return (
    <div className="relative rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
          <div className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-300">{sub}</div>
        </div>
        <div className={"inline-flex h-9 w-9 items-center justify-center rounded-xl " + pill}>{icon}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [period, setPeriod] = React.useState<Period>("30d");

  const { data: dash } = useSWR(`/api/dashboard?period=${period}`, fetcher, {
    keepPreviousData: true,
  });
  const kpi = dash?.kpi;
  const donut: { name: string; value: number }[] = dash?.donut ?? [];
  const procedures: { name: string; volume: number; revenue: number }[] = dash?.topServices ?? [];
  const upcoming: { id: string; patient: string; time: string; procedure: string }[] =
    dash?.upcoming ?? [];
  const stock: { name: string; share: number; percent: number }[] = dash?.stockStatus ?? [];

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const chartColors = {
    bar: isDark ? "#e2e8f0" : "#0f172a", // jasne słupki w dark, ciemne w light
    line: isDark ? "#34d399" : "#059669",
    grid: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.12)",
    tick: isDark ? "#94a3b8" : "#64748b",
    cursor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
  };

  const tooltipProps = {
    contentStyle: {
      backgroundColor: isDark ? "#0b1220" : "#ffffff",
      border: isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(15,23,42,0.1)",
      borderRadius: 12,
      color: isDark ? "#e2e8f0" : "#0f172a",
    },
    labelStyle: { color: isDark ? "#e2e8f0" : "#0f172a", fontWeight: 600 },
    itemStyle: { color: isDark ? "#e2e8f0" : "#0f172a" },
  };

  const data: { day: string; revenue: number; visits: number }[] = dash?.chart ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Panel Zarządzania Kliniką - DerClinic</h1>

        <button className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
          <Plus className="h-4 w-4" />
          Panel zdarzenia
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Dzisiejsze Wizyty"
          value={kpi ? String(kpi.todayVisits) : "—"}
          sub={
            kpi?.todayVisitsDeltaPct === null || kpi?.todayVisitsDeltaPct === undefined
              ? " "
              : `${kpi.todayVisitsDeltaPct >= 0 ? "+" : ""}${kpi.todayVisitsDeltaPct}% z wczoraj`
          }
          accent="green"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Dzisiejszy Przychód"
          value={
            <span className="text-3xl font-semibold">
              {kpi ? formatPLNFromGrosze(kpi.todayRevenue) : "—"}
            </span>
          }
          sub={
            kpi?.todayRevenueDeltaPct === null || kpi?.todayRevenueDeltaPct === undefined
              ? " "
              : `${kpi.todayRevenueDeltaPct >= 0 ? "+" : ""}${kpi.todayRevenueDeltaPct}% vs. wczoraj`
          }
          accent="green"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Nowi Pacjenci"
          value={kpi ? String(kpi.newPatients) : "—"}
          sub={
            kpi
              ? `${kpi.newPatientsDelta >= 0 ? "+" : ""}${kpi.newPatientsDelta} vs. wczoraj`
              : " "
          }
          accent="blue"
          icon={<UserPlus className="h-4 w-4" />}
        />
        <StatCard
          title="Magazyn - Alerty"
          value={kpi ? String(kpi.inventoryAlerts) : "—"}
          sub={
            kpi
              ? kpi.inventoryAlerts > 0
                ? `${kpi.inventoryAlerts} preparaty blisko terminu`
                : "brak alertów"
              : " "
          }
          accent="orange"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-base font-semibold">Przychód i Wizyty (Ostatnie 30 Dni)</div>
            <div className="flex items-center gap-1 rounded-2xl bg-slate-50 p-1 text-sm dark:bg-white/5">
              {[
                { k: "30d" as const, label: "30 dni" },
                { k: "7d" as const, label: "7 dni" },
                { k: "month" as const, label: "Miesiąc" },
                { k: "year" as const, label: "Rok" },
              ].map((x) => (
                <button
                  key={x.k}
                  onClick={() => setPeriod(x.k)}
                  className={
                    "rounded-2xl px-3 py-1.5 font-medium " +
                    (period === x.k
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white")
                  }
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, left: 0, right: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={chartColors.grid} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: chartColors.tick }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: chartColors.tick }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: chartColors.tick }} />
                <Tooltip {...tooltipProps} cursor={{ fill: chartColors.cursor }} />
                <Bar yAxisId="left" dataKey="revenue" fill={chartColors.bar} radius={[10, 10, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="visits" stroke={chartColors.line} strokeWidth={2} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="text-base font-semibold">Struktura Zabiegów</div>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={68} outerRadius={100} paddingAngle={2}>
                  {donut.map((_, i) => (
                    <Cell key={i} />
                  ))}
                </Pie>
                <Tooltip {...tooltipProps} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="truncate">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold">Nadchodzące Wizyty Dzisiaj</div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
              Dzisiaj
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pacjent</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Procedur</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-slate-500">
                      Brak nadchodzących wizyt dzisiaj.
                    </TableCell>
                  </TableRow>
                )}
                {upcoming.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-200" />
                        <div className="font-medium">{r.patient}</div>
                      </div>
                    </TableCell>
                    <TableCell>{r.time}</TableCell>
                    <TableCell>{r.procedure}</TableCell>
                    <TableCell className="text-right">⋮</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold">Najpopularniejsze Zabiegi</div>
            <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">
              Zabiegów <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zabiegi</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead className="text-right">Przychód</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedures.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-slate-500">
                      Brak danych z ostatnich 30 dni.
                    </TableCell>
                  </TableRow>
                )}
                {procedures.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.volume}%</TableCell>
                    <TableCell className="text-right">{formatPLNFromGrosze(r.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <div className="text-base font-semibold">Status Magazynu Preparatów</div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Top usualized items</TableHead>
                <TableHead>Preparatów</TableHead>
                <TableHead>Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-slate-500">
                    Brak zużyć z ostatnich 30 dni.
                  </TableCell>
                </TableRow>
              )}
              {stock.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.share}%</TableCell>
                  <TableCell>
                    <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/10">
                      <div
                        className="h-2.5 rounded-full bg-emerald-500"
                        style={{ width: `${r.percent}%` }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
