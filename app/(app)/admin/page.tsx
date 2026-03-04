"use client";

import * as React from "react";
// używamy <img> dla lokalnych SVG (bez konfiguracji Next/Image pod SVG)
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  Package,
  Plus,
  Users,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

type Period = "30d" | "7d" | "month" | "year";

const KPI = {
  visitsToday: 24,
  visitsDelta: "+8% z wczoraj",
  revenueToday: 18750,
  revenueDelta: "+12% vs. target",
  newPatients: 15,
  newPatientsDelta: "+3",
  stockAlerts: 4,
  stockAlertsNote: "4 preparaty blisko terminu",
};

const chart30d = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  // stabilne, powtarzalne dane demo (bez losowości)
  const base = 280 + (day % 6) * 55;
  const revenue = base + (day % 3) * 80 + (day === 11 ? 320 : 0) + (day === 27 ? 260 : 0);
  const visits = 60 + (day % 7) * 9 + (day === 16 ? 35 : 0);
  return { day, revenue, visits };
});

const chart7d = chart30d.slice(-7);

const chartMonth = Array.from({ length: 12 }, (_, i) => {
  const m = i + 1;
  const revenue = 4200 + m * 180 + (m % 3) * 260;
  const visits = 520 + m * 22 + (m % 4) * 35;
  return { month: m, revenue, visits };
});

const chartYear = Array.from({ length: 5 }, (_, i) => {
  const y = 2021 + i;
  const revenue = 52000 + i * 6800 + (i % 2) * 4200;
  const visits = 7200 + i * 720 + (i % 2) * 410;
  return { year: y, revenue, visits };
});

const procedureStructure = [
  { name: "Toksyna\nBotulinowa", value: 35 },
  { name: "Wypełniacze", value: 30 },
  { name: "Laseroterapia", value: 20 },
  { name: "Inne", value: 15 },
];

const topProcedures = [
  { name: "Toksyna Botulinowa", volume: "35%", revenue: "PLN 18,750" },
  { name: "Wypełniacze", volume: "30%", revenue: "PLN 18,750" },
  { name: "Laseroterapia", volume: "20%", revenue: "PLN 8,250" },
  { name: "Inne", volume: "15%", revenue: "PLN 5,500" },
];

const upcomingVisits = [
  { name: "Ewaa Kowalska", time: "09:00 PM", procedure: "Toksyna Botulinowa" },
  { name: "Ewaa Kowalska", time: "09:00 PM", procedure: "Wypełniacze" },
  { name: "Mara Łonsia", time: "07:00 AM", procedure: "Toksyna Botulinowa" },
];

const stockStatus = [
  { name: "Toksyna Botulinowa (35%)", prep: "35%", stock: 82 },
  { name: "Wypełniacze (30%)", prep: "30%", stock: 61 },
  { name: "Laseroterapia (20%)", prep: "20%", stock: 44 },
  { name: "Inne (15%)", prep: "15%", stock: 33 },
];

function formatPLN(n: number) {
  return n.toLocaleString("pl-PL");
}

function SidebarItem({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition " +
        (active
          ? "bg-[#dff3f2] text-[#0c6b6b] shadow-sm dark:bg-white/10 dark:text-white"
          : "text-slate-600 hover:bg-slate-100/60 dark:text-slate-300 dark:hover:bg-white/5")
      }
    >
      <span className={active ? "text-[#1aa9a8]" : "text-slate-400 dark:text-slate-400"}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {(label === "Przychód" || label === "Zabiegów Klinika" || label === "Magazyn - Alerty") && (
        <ChevronDown className="ml-auto h-4 w-4 opacity-60" />
      )}
    </button>
  );
}

function KpiCard({
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
          <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {value}
          </div>
          <div className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-300">{sub}</div>
        </div>
        <div className={"inline-flex h-9 w-9 items-center justify-center rounded-xl " + pill}>{icon}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [period, setPeriod] = React.useState<Period>("30d");

  const data = React.useMemo(() => {
    if (period === "7d") return chart7d.map((d) => ({ label: String(d.day), ...d }));
    if (period === "month") return chartMonth.map((d) => ({ label: String(d.month), ...d }));
    if (period === "year") return chartYear.map((d) => ({ label: String(d.year), ...d }));
    return chart30d.map((d) => ({ label: String(d.day), ...d }));
  }, [period]);

  return (
    <div className="min-h-[100vh] bg-gradient-to-b from-[#eef3f7] via-[#eef3f7] to-[#f7fbff] text-slate-900 dark:from-[#070b13] dark:via-[#070b13] dark:to-[#0b1220] dark:text-white">
      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-5">
        {/* Sidebar */}
        <aside className="hidden w-[260px] shrink-0 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 lg:block">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white shadow-sm">
              <img src="/logo-estetika.svg" alt="Estetika" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-base font-semibold leading-tight text-slate-900 dark:text-white">Estetika</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Clinique</div>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <SidebarItem icon={<LayoutDashboard className="h-5 w-5" />} label="Dashboard" active />
            <SidebarItem icon={<CalendarDays className="h-5 w-5" />} label="Wizyty" />
            <SidebarItem icon={<DollarSign className="h-5 w-5" />} label="Przychód" />
            <SidebarItem icon={<ClipboardList className="h-5 w-5" />} label="Zabiegów Klinika" />
            <SidebarItem icon={<Users className="h-5 w-5" />} label="Nowi Pacjenci" />
            <SidebarItem icon={<Users className="h-5 w-5" />} label="Drofila" />
            <SidebarItem icon={<Package className="h-5 w-5" />} label="Magazyn - Alerty" />
            <SidebarItem icon={<Package className="h-5 w-5" />} label="Magazyn reparatów" />
            <SidebarItem icon={<Package className="h-5 w-5" />} label="Wapozylanie" />
          </div>

          <div className="mt-8 flex items-center justify-end px-2">
            <span className="text-slate-400 dark:text-slate-500">⇆</span>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1">
          {/* Top bar */}
          <div className="flex items-center gap-4">
            <div className="relative hidden h-10 w-10 overflow-hidden rounded-xl bg-white shadow-sm lg:hidden">
              <img src="/logo-estetika.svg" alt="Estetika" className="h-full w-full object-contain" />
            </div>

            <div className="relative flex-1">
              <div className="flex h-11 items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
                <span className="text-slate-400 dark:text-slate-500">⌕</span>
                <input
                  aria-label="Search"
                  placeholder="Search..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-slate-600 dark:text-slate-200" />
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500" />
              </button>

              <div className="hidden items-center gap-3 rounded-2xl border border-white/60 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 sm:flex">
                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200">
                  <img src="/demo-avatar-ewa.svg" alt="Dr. Ewa Kowalska" className="h-full w-full object-cover" />
                </div>
                <div className="leading-tight">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Dr. Ewa Kowalska</div>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </div>

              <button
                type="button"
                className="hidden h-11 items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 text-sm font-medium text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 dark:text-slate-200 sm:flex"
              >
                EN <ChevronDown className="h-4 w-4 opacity-60" />
              </button>

              <ThemeToggle />
            </div>
          </div>

          {/* Header */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Panel Zarządzania Kliniką - Estetika Clinique
            </h1>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#1aa9a8] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95"
            >
              <Plus className="h-4 w-4" /> Panel zozdaria
            </button>
          </div>

          {/* KPI */}
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Dzisiejsze Wizyty"
              value={KPI.visitsToday}
              sub={KPI.visitsDelta}
              accent="green"
              icon={<span className="text-emerald-600 dark:text-emerald-300">↗</span>}
            />
            <KpiCard
              title="Dzisiejszy Przychód"
              value={
                <>
                  PLN {formatPLN(KPI.revenueToday)}
                </>
              }
              sub={KPI.revenueDelta}
              accent="green"
              icon={<span className="text-emerald-600 dark:text-emerald-300">↗</span>}
            />
            <KpiCard
              title="Nowi Pacjenci"
              value={KPI.newPatients}
              sub={KPI.newPatientsDelta}
              accent="blue"
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              title="Magazyn - Alerty"
              value={KPI.stockAlerts}
              sub={KPI.stockAlertsNote}
              accent="orange"
              icon={<span className="text-orange-600 dark:text-orange-300">⚠</span>}
            />
          </div>

          {/* Charts row */}
          <div className="mt-4 grid gap-4 xl:grid-cols-12">
            {/* Big chart */}
            <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-6">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Przychód i Wizyty (Ostatnie 30 Dni)
                </div>
                <div className="flex items-center gap-1 rounded-2xl bg-slate-100/70 p-1 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => setPeriod("30d")}
                    className={
                      "rounded-xl px-3 py-1 text-xs font-semibold " +
                      (period === "30d"
                        ? "bg-[#dff3f2] text-[#0c6b6b]"
                        : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5")
                    }
                  >
                    30 dni
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriod("7d")}
                    className={
                      "rounded-xl px-3 py-1 text-xs font-semibold " +
                      (period === "7d"
                        ? "bg-[#dff3f2] text-[#0c6b6b]"
                        : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5")
                    }
                  >
                    7 dni
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriod("month")}
                    className={
                      "rounded-xl px-3 py-1 text-xs font-semibold " +
                      (period === "month"
                        ? "bg-[#dff3f2] text-[#0c6b6b]"
                        : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5")
                    }
                  >
                    Miesiąc
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriod("year")}
                    className={
                      "rounded-xl px-3 py-1 text-xs font-semibold " +
                      (period === "year"
                        ? "bg-[#dff3f2] text-[#0c6b6b]"
                        : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/5")
                    }
                  >
                    Rok
                  </button>
                </div>
              </div>

              <div className="mt-3 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      tickFormatter={(v) => `PLN ${v}`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                      formatter={(value: any, name: any) => {
                        if (name === "revenue") return [`PLN ${value}`, "Przychód"];
                        if (name === "visits") return [value, "Wizyty"];
                        return [value, name];
                      }}
                    />
                    <Bar yAxisId="left" dataKey="revenue" radius={[10, 10, 10, 10]} />
                    <Line yAxisId="right" type="monotone" dataKey="visits" strokeWidth={3} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Donut */}
            <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-3">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Struktura Zabiegów</div>
              <div className="mt-2 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      formatter={(value: any, name: any) => [`${value}%`, String(name).replace(/\n/g, " ")]} 
                      contentStyle={{ borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}
                    />
                    <Pie
                      data={procedureStructure}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {procedureStructure.map((_, idx) => (
                        <Cell key={idx} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                {procedureStructure.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span className="truncate">{p.name.replace(/\n/g, " ")}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Top procedures */}
            <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-3">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Najpopularniejsze Zabiegi</div>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 bg-white/40 dark:border-white/10 dark:bg-white/5">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-500 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-white/10">
                      <th className="px-3 py-2 font-semibold">Zabiegi</th>
                      <th className="px-3 py-2 font-semibold">Volume</th>
                      <th className="px-3 py-2 font-semibold">Przychód</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProcedures.map((r) => (
                      <tr key={r.name} className="border-b border-slate-100 last:border-b-0 dark:border-white/10">
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{r.name}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.volume}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.revenue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#1aa9a8]/30 bg-white/70 px-3 py-2 text-xs font-semibold text-[#0c6b6b] shadow-sm backdrop-blur hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-[#9ae7e6]"
                >
                  Zabiegiów <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </section>
          </div>

          {/* Bottom row */}
          <div className="mt-4 grid gap-4 xl:grid-cols-12">
            <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-6">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Nadchodzące Wizyty Dzisiaj</div>
                <button
                  type="button"
                  className="rounded-2xl border border-[#1aa9a8]/30 bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#0c6b6b] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-[#9ae7e6]"
                >
                  Dzisiaj
                </button>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 bg-white/40 dark:border-white/10 dark:bg-white/5">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-500 dark:text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-white/10">
                      <th className="px-3 py-2 font-semibold">Pacjent</th>
                      <th className="px-3 py-2 font-semibold">Time</th>
                      <th className="px-3 py-2 font-semibold">Procedur</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingVisits.map((v, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-b-0 dark:border-white/10">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 overflow-hidden rounded-full bg-slate-200">
                              <img
                                src={idx === 0 ? "/demo-avatar-ewa.svg" : idx === 1 ? "/demo-avatar-ewa.svg" : "/demo-avatar-mara.svg"}
                                alt={v.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="font-medium text-slate-800 dark:text-slate-200">{v.name}</div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{v.time}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{v.procedure}</td>
                        <td className="px-3 py-2 text-right text-slate-400">⋮</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 xl:col-span-6">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Status Magazynu Preparatów</div>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 bg-white/40 dark:border-white/10 dark:bg-white/5">
                <div className="grid grid-cols-12 gap-3 border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <div className="col-span-6">Top usualized items</div>
                  <div className="col-span-2">Preparatów</div>
                  <div className="col-span-4">Stock</div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/10">
                  {stockStatus.map((s) => (
                    <div key={s.name} className="grid grid-cols-12 gap-3 px-3 py-3 text-sm">
                      <div className="col-span-6 text-slate-800 dark:text-slate-200">{s.name}</div>
                      <div className="col-span-2 text-slate-600 dark:text-slate-300">{s.prep}</div>
                      <div className="col-span-4">
                        <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/10">
                          <div
                            className="h-2.5 rounded-full bg-[#38b3b1]"
                            style={{ width: `${Math.min(100, Math.max(0, s.stock))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
