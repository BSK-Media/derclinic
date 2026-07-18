"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { TrendingUp, UserPlus, AlertTriangle, Users } from "lucide-react";
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
import { useAuth } from "@/components/auth-provider";

const DONUT_COLORS = [
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
  "#6366f1",
  "#f97316",
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Period = "30d" | "7d" | "month" | "year";

type InventoryStatusRow = {
  productId: string;
  name: string;
  unit: string;
  used30: number;
  stock: number;
  wosWeeks: number;
  coverageDays: number;
  coveragePercent: number;
};

const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  MG: "mg",
  G: "g",
  AMPULE: "amp.",
  BOTOX_UNIT: "j. botoksu",
};

const quantityFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const wosFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function InventoryProductsTable({
  title,
  rows,
}: {
  title: string;
  rows: InventoryStatusRow[];
}) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
        {title}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64">Nazwa produktu</TableHead>
              <TableHead className="min-w-52">Zużyte przez ostatnie 30 dni</TableHead>
              <TableHead className="min-w-44">Stan magazynowy</TableHead>
              <TableHead className="min-w-52 py-2">
                <span className="block">WOS</span>
                <span className="mt-0.5 block text-[10px] font-normal leading-tight text-slate-400 dark:text-slate-500">
                  Przewidywany czas wystarczalności
                </span>
              </TableHead>
              <TableHead className="min-w-64">Pokrycie na kolejne 30 dni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-slate-500">
                  Brak potwierdzonych zużyć z ostatnich 30 dni.
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.productId}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  {quantityFormatter.format(row.used30)} {UNIT_LABELS[row.unit] ?? row.unit}
                </TableCell>
                <TableCell>
                  {quantityFormatter.format(row.stock)} {UNIT_LABELS[row.unit] ?? row.unit}
                </TableCell>
                <TableCell>{wosFormatter.format(row.wosWeeks)} tyg.</TableCell>
                <TableCell>
                  <div
                    className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/10"
                    title={`Zapas na około ${quantityFormatter.format(row.coverageDays)} dni`}
                  >
                    <div
                      className="h-2.5 rounded-full bg-emerald-500 transition-[width]"
                      style={{ width: `${row.coveragePercent}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  accent,
  icon,
  href,
}: {
  title: string;
  value: React.ReactNode;
  sub: string;
  accent: "green" | "blue" | "orange";
  icon: React.ReactNode;
  href?: string;
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
        {href ? (
          <Link
            href={href}
            title={title}
            className={
              "inline-flex h-9 w-9 items-center justify-center rounded-xl transition hover:scale-110 hover:shadow " +
              pill
            }
          >
            {icon}
          </Link>
        ) : (
          <div className={"inline-flex h-9 w-9 items-center justify-center rounded-xl " + pill}>{icon}</div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [period, setPeriod] = React.useState<Period>("30d");
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const { data: dash } = useSWR(`/api/dashboard?period=${period}`, fetcher, {
    keepPreviousData: true,
  });
  const kpi = dash?.kpi;
  const donut: { name: string; value: number }[] = dash?.donut ?? [];
  const procedures: { name: string; volume: number; revenue: number }[] = dash?.topServices ?? [];
  const upcoming: { id: string; patient: string; time: string; procedure: string }[] =
    dash?.upcoming ?? [];
  const mostUsedProducts: InventoryStatusRow[] = dash?.mostUsedProducts ?? [];
  const lowStockProducts: InventoryStatusRow[] = dash?.lowStockProducts ?? [];

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

      </div>

      <div className={"grid gap-5 md:grid-cols-2 " + (isAdmin ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
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
          href="/admin/visits"
        />
        {isAdmin ? (
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
          href="/admin/analytics"
        />
        ) : null}
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
          href="/admin/patients"
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
          href="/admin/inventory"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-base font-semibold">{isAdmin ? "Przychód i Wizyty" : "Wizyty"}</div>
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
                {isAdmin ? (
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: chartColors.tick }} />
                ) : null}
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: chartColors.tick }} />
                <Tooltip
                  {...tooltipProps}
                  cursor={{ fill: chartColors.cursor }}
                  formatter={(value: any, name: any) =>
                    name === "Przychód" ? [`${Number(value).toLocaleString("pl-PL")} zł`, name] : [value, name]
                  }
                />
                {isAdmin ? (
                  <Bar
                    yAxisId="left"
                    dataKey="revenue"
                    name="Przychód"
                    fill={chartColors.bar}
                    radius={[10, 10, 0, 0]}
                  />
                ) : null}
                <Bar
                  yAxisId="right"
                  dataKey="visits"
                  name="Wizyty"
                  fill={chartColors.line}
                  radius={[10, 10, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
          <div className="text-base font-semibold">
            Udział zabiegów według kategorii - ostatnie 30 dni
          </div>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={68} outerRadius={100} paddingAngle={2}>
                  {donut.map((_, i) => (
                    <Cell
                      key={i}
                      fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                      stroke={isDark ? "#0b1220" : "#ffffff"}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip {...tooltipProps} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
            {donut.map((d, index) => (
              <div key={d.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
                />
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
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/60 bg-white/60 dark:border-white/10 dark:bg-white/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zabiegi</TableHead>
                  <TableHead>Volume</TableHead>
                  {isAdmin ? <TableHead className="text-right">Przychód</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedures.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 3 : 2} className="text-slate-500">
                      Brak danych z ostatnich 30 dni.
                    </TableCell>
                  </TableRow>
                )}
                {procedures.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.volume}%</TableCell>
                    {isAdmin ? (
                      <TableCell className="text-right">{formatPLNFromGrosze(r.revenue)}</TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
        <div className="text-base font-semibold">Status Magazynu Preparatów</div>
        <div className="mt-5 space-y-7">
          <InventoryProductsTable
            title="Najczęściej używane produkty"
            rows={mostUsedProducts}
          />
          <InventoryProductsTable title="Produkty z niskim stanem" rows={lowStockProducts} />
        </div>
      </div>
    </div>
  );
}
