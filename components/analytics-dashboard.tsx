"use client";

import * as React from "react";
import useSWR from "swr";
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
  Legend,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  PackageOpen,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPLNFromGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Period = "7d" | "30d" | "90d" | "month" | "prevMonth" | "year";
type MobileTab = "overview" | "specialists" | "services" | "products";

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "Ostatnie 7 dni" },
  { value: "30d", label: "Ostatnie 30 dni" },
  { value: "90d", label: "Ostatnie 90 dni" },
  { value: "month", label: "Bieżący miesiąc" },
  { value: "prevMonth", label: "Poprzedni miesiąc" },
  { value: "year", label: "Bieżący rok" },
];

const METHOD_LABELS: Record<string, string> = {
  CASH: "Gotówka",
  CARD: "Karta",
  VOUCHER: "Voucher",
};

const PIE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#0ea5e9"];
const DOW_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const HEATMAP_HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00–20:00

function periodToRange(period: Period) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  if (period === "7d") start.setDate(start.getDate() - 6);
  else if (period === "30d") start.setDate(start.getDate() - 29);
  else if (period === "90d") start.setDate(start.getDate() - 89);
  else if (period === "month") start.setDate(1);
  else if (period === "prevMonth") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0); // ostatni dzień poprzedniego miesiąca
  } else if (period === "year") {
    start.setMonth(0, 1);
  }
  start.setHours(0, 0, 0, 0);
  const iso = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  return { from: iso(start), to: iso(end) };
}

function pctDelta(current: number, previous: number) {
  if (!previous) return null;
  return (current - previous) / previous;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const d = pctDelta(current, previous);
  if (d === null) return <span className="text-xs text-zinc-400">brak porównania</span>;
  const up = d >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-xs font-medium " +
        (up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
      }
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {(d * 100).toFixed(1)}% vs poprzedni okres
    </span>
  );
}

function KpiCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="space-y-1 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub ? <div>{sub}</div> : null}
    </Card>
  );
}

function MobileMetric({
  title,
  value,
  sub,
  valueClassName = "",
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="min-w-0 p-3.5">
      <div className="text-xs leading-4 text-zinc-500">{title}</div>
      <div
        className={`mt-1 break-words text-xl font-semibold tabular-nums leading-tight ${valueClassName}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5">{sub}</div> : null}
    </Card>
  );
}

const MOBILE_TABS: { value: MobileTab; label: string; icon: React.ReactNode }[] = [
  { value: "overview", label: "Przegląd", icon: <BarChart3 className="h-4 w-4" /> },
  { value: "specialists", label: "Specjaliści", icon: <UserRound className="h-4 w-4" /> },
  { value: "services", label: "Usługi", icon: <Stethoscope className="h-4 w-4" /> },
  { value: "products", label: "Preparaty", icon: <PackageOpen className="h-4 w-4" /> },
];

export function AnalyticsDashboard({
  apiPath = "/api/admin/analytics",
  title = "Analityka",
  description = "Przychody, wizyty i zużycie preparatów — dane liczone dla wizyt zakończonych i zaakceptowanych.",
}: {
  apiPath?: string;
  title?: string;
  description?: string;
}) {
  const [period, setPeriod] = React.useState<Period>("30d");
  const [specialistId, setSpecialistId] = React.useState<string>("ALL");
  const [mobileTab, setMobileTab] = React.useState<MobileTab>("overview");
  const [showAllIndicators, setShowAllIndicators] = React.useState(false);

  const { from, to } = React.useMemo(() => periodToRange(period), [period]);
  const query = new URLSearchParams({ from, to });
  if (specialistId !== "ALL") query.set("specialistId", specialistId);

  const { data, isLoading } = useSWR(`${apiPath}?${query.toString()}`, fetcher, {
    keepPreviousData: true,
  });

  const kpi = data?.kpi;
  const series = (data?.revenueSeries ?? []).map((r: any) => ({
    ...r,
    revenuePLN: r.revenue / 100,
  }));
  const statusData = data
    ? [
        { name: "Zakończone", value: data.statusCounts.COMPLETED, color: "#10b981" },
        { name: "Zaplanowane", value: data.statusCounts.SCHEDULED, color: "#6366f1" },
        { name: "Odwołane", value: data.statusCounts.CANCELED, color: "#f59e0b" },
        { name: "No-show", value: data.statusCounts.NO_SHOW, color: "#ef4444" },
      ].filter((s) => s.value > 0)
    : [];
  const methodData = (data?.paymentMethods ?? []).map((m: any) => ({
    name: METHOD_LABELS[m.method] ?? m.method,
    value: m.amount / 100,
  }));

  const heatmap: number[][] = data?.heatmap ?? [];
  const heatMax = Math.max(1, ...heatmap.flat());

  return (
    <div className="space-y-6">
      <div className="hidden flex-wrap items-end justify-between gap-3 md:flex">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={specialistId} onValueChange={setSpecialistId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Specjalista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Wszyscy specjaliści</SelectItem>
              {(data?.specialistOptions ?? []).map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p>
        </div>

        <Card className="divide-y divide-zinc-200 p-0 dark:divide-zinc-800">
          <div className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800">
              <CalendarDays className="h-5 w-5" />
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-left font-medium shadow-none dark:bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800">
              <UserRound className="h-5 w-5" />
            </div>
            <Select value={specialistId} onValueChange={setSpecialistId}>
              <SelectTrigger className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-left font-medium shadow-none dark:bg-transparent">
                <SelectValue placeholder="Specjalista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Wszyscy specjaliści</SelectItem>
                {(data?.specialistOptions ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <div className="grid grid-cols-4 gap-2" role="tablist" aria-label="Sekcje analityki">
          {MOBILE_TABS.map((tab) => {
            const active = mobileTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileTab(tab.value)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                }`}
              >
                {tab.icon}
                <span className="w-full truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="p-6 text-sm text-zinc-500">Ładowanie danych…</div>
      ) : !kpi ? (
        <div className="p-6 text-sm text-zinc-500">Brak danych.</div>
      ) : (
        <>
          {/* Mobile */}
          <div className="space-y-5 md:hidden">
            {mobileTab === "overview" ? (
              <>
                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Najważniejsze wyniki</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <MobileMetric
                      title="Przychód"
                      value={formatPLNFromGrosze(kpi.revenue)}
                      sub={<Delta current={kpi.revenue} previous={kpi.prevRevenue} />}
                    />
                    <MobileMetric
                      title="Wizyty rozliczone"
                      value={kpi.appointments}
                      sub={<Delta current={kpi.appointments} previous={kpi.prevAppointments} />}
                    />
                    <MobileMetric
                      title="Śr. wartość wizyty"
                      value={formatPLNFromGrosze(kpi.avgPrice)}
                    />
                    <MobileMetric
                      title="Marża po materiałach"
                      value={formatPLNFromGrosze(kpi.margin)}
                      sub={
                        <span className="block text-[11px] leading-4 text-zinc-500">
                          Koszt: {formatPLNFromGrosze(kpi.materialsCost)}
                        </span>
                      }
                    />
                  </div>

                  {showAllIndicators ? (
                    <div className="grid grid-cols-2 gap-3">
                      <MobileMetric title="Zapłacono" value={formatPLNFromGrosze(kpi.paid)} />
                      <MobileMetric
                        title="Zaległości"
                        value={formatPLNFromGrosze(kpi.outstanding)}
                        valueClassName={
                          kpi.outstanding > 0 ? "text-amber-600 dark:text-amber-400" : ""
                        }
                      />
                      <MobileMetric title="Nowi pacjenci" value={kpi.newPatients} />
                      <MobileMetric
                        title="Odwołania / no-show"
                        value={`${(kpi.noShowRate * 100).toFixed(1)}%`}
                        sub={
                          <span className="text-[11px] text-zinc-500">
                            Odwołania: {(kpi.cancelRate * 100).toFixed(1)}%
                          </span>
                        }
                      />
                      <MobileMetric
                        title="Sprzedaż materiałów"
                        value={formatPLNFromGrosze(kpi.materialsSaleValue)}
                      />
                      <MobileMetric
                        title="Czeka na akceptację"
                        value={kpi.pendingApproval}
                        valueClassName={
                          kpi.pendingApproval > 0 ? "text-amber-600 dark:text-amber-400" : ""
                        }
                      />
                    </div>
                  ) : (
                    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
                      <div className="w-[45%] min-w-[145px] shrink-0 snap-start">
                        <MobileMetric title="Zapłacono" value={formatPLNFromGrosze(kpi.paid)} />
                      </div>
                      <div className="w-[45%] min-w-[145px] shrink-0 snap-start">
                        <MobileMetric
                          title="Zaległości"
                          value={formatPLNFromGrosze(kpi.outstanding)}
                          valueClassName={
                            kpi.outstanding > 0 ? "text-amber-600 dark:text-amber-400" : ""
                          }
                        />
                      </div>
                      <div className="w-[45%] min-w-[145px] shrink-0 snap-start">
                        <MobileMetric title="Nowi pacjenci" value={kpi.newPatients} />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowAllIndicators((value) => !value)}
                    className="mx-auto flex items-center gap-2 py-1 text-sm font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    {showAllIndicators ? "Ukryj dodatkowe wskaźniki" : "Wszystkie wskaźniki"}
                    {showAllIndicators ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </section>

                <Card className="overflow-hidden p-3">
                  <div className="mb-3 font-medium">Przychód i liczba wizyt</div>
                  <div className="h-64 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={series}
                        margin={{ top: 8, right: 0, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} minTickGap={30} />
                        <YAxis
                          yAxisId="rev"
                          width={52}
                          tick={{ fontSize: 9 }}
                          tickFormatter={(v) => `${Math.round(v)} zł`}
                        />
                        <YAxis
                          yAxisId="vis"
                          width={24}
                          orientation="right"
                          tick={{ fontSize: 9 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          formatter={(value: any, name: any) =>
                            name === "Przychód"
                              ? [
                                  Number(value).toLocaleString("pl-PL", {
                                    style: "currency",
                                    currency: "PLN",
                                  }),
                                  name,
                                ]
                              : [value, name]
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar
                          yAxisId="vis"
                          dataKey="visits"
                          name="Wizyty"
                          fill="#c7d2fe"
                          radius={[3, 3, 0, 0]}
                        />
                        <Line
                          yAxisId="rev"
                          type="monotone"
                          dataKey="revenuePLN"
                          name="Przychód"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <section className="space-y-3">
                  <h2 className="text-lg font-semibold">Struktura</h2>
                  <div className="grid gap-3 min-[400px]:grid-cols-2">
                    <Card className="min-w-0 p-3">
                      <div className="font-medium">Wizyty wg statusu</div>
                      {statusData.length === 0 ? (
                        <div className="mt-3 text-sm text-zinc-500">Brak wizyt w okresie.</div>
                      ) : (
                        <div className="h-52 min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={statusData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={40}
                                outerRadius={62}
                                paddingAngle={2}
                              >
                                {statusData.map((s) => (
                                  <Cell key={s.name} fill={s.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </Card>

                    <Card className="min-w-0 p-3">
                      <div className="font-medium">Płatności</div>
                      {methodData.length === 0 ? (
                        <div className="mt-3 text-sm text-zinc-500">Brak płatności w okresie.</div>
                      ) : (
                        <div className="h-52 min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={methodData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={40}
                                outerRadius={62}
                                paddingAngle={2}
                              >
                                {methodData.map((m: any, i: number) => (
                                  <Cell key={m.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: any) =>
                                  Number(value).toLocaleString("pl-PL", {
                                    style: "currency",
                                    currency: "PLN",
                                  })
                                }
                              />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </Card>
                  </div>

                  <Card className="min-w-0 p-3">
                    <div className="mb-3 font-medium">Obłożenie — dni i godziny</div>
                    <div className="max-w-full overflow-x-auto pb-1">
                      <div className="min-w-[420px]">
                        <div className="grid grid-cols-[28px_repeat(14,1fr)] gap-0.5 text-[10px] text-zinc-500">
                          <div />
                          {HEATMAP_HOURS.map((h) => (
                            <div key={h} className="text-center">
                              {h}
                            </div>
                          ))}
                          {DOW_LABELS.map((d, di) => (
                            <React.Fragment key={d}>
                              <div className="flex items-center">{d}</div>
                              {HEATMAP_HOURS.map((h) => {
                                const v = heatmap[di]?.[h] ?? 0;
                                const alpha = v === 0 ? 0 : 0.15 + 0.85 * (v / heatMax);
                                return (
                                  <div
                                    key={h}
                                    title={`${d} ${h}:00 — ${v} wizyt`}
                                    className="aspect-square rounded-sm border border-zinc-100 dark:border-zinc-800"
                                    style={{ backgroundColor: `rgba(16,185,129,${alpha})` }}
                                  />
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </section>
              </>
            ) : null}

            {mobileTab === "specialists" ? (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Ranking specjalistów</h2>
                {(data.specialists ?? []).length === 0 ? (
                  <Card className="text-sm text-zinc-500">Brak danych w okresie.</Card>
                ) : (
                  (data.specialists ?? []).map((s: any, index: number) => (
                    <Card key={s.id} className="space-y-3 p-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          {index + 1}
                        </div>
                        <div className="min-w-0 truncate font-semibold">{s.name}</div>
                      </div>
                      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-zinc-200 text-xs dark:border-zinc-800">
                        <div className="border-b border-r border-zinc-200 p-2.5 dark:border-zinc-800">
                          <div className="text-zinc-500">Wizyty</div>
                          <div className="mt-1 font-semibold">{s.appointments}</div>
                        </div>
                        <div className="border-b border-zinc-200 p-2.5 dark:border-zinc-800">
                          <div className="text-zinc-500">Przychód</div>
                          <div className="mt-1 break-words font-semibold">
                            {formatPLNFromGrosze(s.revenue)}
                          </div>
                        </div>
                        <div className="border-r border-zinc-200 p-2.5 dark:border-zinc-800">
                          <div className="text-zinc-500">Koszt materiałów</div>
                          <div className="mt-1 break-words font-semibold">
                            {formatPLNFromGrosze(s.materialsCost)}
                          </div>
                        </div>
                        <div className="p-2.5">
                          <div className="text-zinc-500">Marża</div>
                          <div className="mt-1 break-words font-semibold">
                            {formatPLNFromGrosze(s.margin)}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Śr. cena: {formatPLNFromGrosze(s.avgPrice)} · odwołania/no-show:{" "}
                        {(s.cancelNoShowRate * 100).toFixed(1)}%
                      </div>
                    </Card>
                  ))
                )}
              </section>
            ) : null}

            {mobileTab === "services" ? (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Top 10 usług wg przychodu</h2>
                {(data.topServices ?? []).length === 0 ? (
                  <Card className="text-sm text-zinc-500">Brak danych w okresie.</Card>
                ) : (
                  (data.topServices ?? []).map((s: any, index: number) => (
                    <Card key={`${s.name}-${index}`} className="p-3.5">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="break-words font-medium leading-5">{s.name}</div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-zinc-500">Wykonania</div>
                              <div className="mt-0.5 font-semibold">{s.count}</div>
                            </div>
                            <div>
                              <div className="text-zinc-500">Przychód</div>
                              <div className="mt-0.5 break-words font-semibold">
                                {formatPLNFromGrosze(s.revenue)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </section>
            ) : null}

            {mobileTab === "products" ? (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Top 10 preparatów wg wartości zużycia</h2>
                {(data.topProducts ?? []).length === 0 ? (
                  <Card className="text-sm text-zinc-500">Brak danych w okresie.</Card>
                ) : (
                  (data.topProducts ?? []).map((p: any, index: number) => (
                    <Card key={`${p.name}-${index}`} className="p-3.5">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="break-words font-medium leading-5">{p.name}</div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <div className="text-zinc-500">Ilość</div>
                              <div className="mt-0.5 font-semibold">{p.quantity}</div>
                            </div>
                            <div>
                              <div className="text-zinc-500">Koszt</div>
                              <div className="mt-0.5 break-words font-semibold">
                                {formatPLNFromGrosze(p.cost)}
                              </div>
                            </div>
                            <div>
                              <div className="text-zinc-500">Sprzedaż</div>
                              <div className="mt-0.5 break-words font-semibold">
                                {formatPLNFromGrosze(p.value)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </section>
            ) : null}
          </div>

          {/* KPI */}
          <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              title="Przychód"
              value={formatPLNFromGrosze(kpi.revenue)}
              sub={<Delta current={kpi.revenue} previous={kpi.prevRevenue} />}
            />
            <KpiCard
              title="Wizyty rozliczone"
              value={kpi.appointments}
              sub={<Delta current={kpi.appointments} previous={kpi.prevAppointments} />}
            />
            <KpiCard
              title="Śr. wartość wizyty"
              value={formatPLNFromGrosze(kpi.avgPrice)}
              sub={<Delta current={kpi.avgPrice} previous={kpi.prevAvgPrice} />}
            />
            <KpiCard
              title="Marża po materiałach"
              value={formatPLNFromGrosze(kpi.margin)}
              sub={
                <span className="text-xs text-zinc-500">
                  koszt materiałów: {formatPLNFromGrosze(kpi.materialsCost)}
                </span>
              }
            />
            <KpiCard
              title="No-show / odwołania"
              value={`${(kpi.noShowRate * 100).toFixed(1)}%`}
              sub={
                <span className="text-xs text-zinc-500">
                  odwołania: {(kpi.cancelRate * 100).toFixed(1)}%
                </span>
              }
            />
            <KpiCard
              title="Nowi pacjenci"
              value={kpi.newPatients}
              sub={<Delta current={kpi.newPatients} previous={kpi.prevNewPatients} />}
            />
          </div>

          {/* Rozliczenia */}
          <div className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Zapłacono" value={formatPLNFromGrosze(kpi.paid)} />
            <KpiCard
              title="Do zapłaty (zaległości)"
              value={
                <span className={kpi.outstanding > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
                  {formatPLNFromGrosze(kpi.outstanding)}
                </span>
              }
            />
            <KpiCard
              title="Wartość sprzedażowa materiałów"
              value={formatPLNFromGrosze(kpi.materialsSaleValue)}
            />
            <KpiCard
              title="Czeka na akceptację"
              value={
                <span
                  className={kpi.pendingApproval > 0 ? "text-amber-600 dark:text-amber-400" : ""}
                >
                  {kpi.pendingApproval}
                </span>
              }
              sub={
                kpi.rejected > 0 ? (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    odrzucone: {kpi.rejected}
                  </span>
                ) : null
              }
            />
          </div>

          {/* Przychód w czasie */}
          <Card className="hidden p-4 md:block">
            <div className="mb-4 font-medium">
              Przychód i liczba wizyt{" "}
              <span className="text-xs font-normal text-zinc-500">
                ({data.seriesGranularity === "day" ? "dziennie" : "miesięcznie"})
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis
                    yAxisId="rev"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v)} zł`}
                  />
                  <YAxis
                    yAxisId="vis"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) =>
                      name === "Przychód"
                        ? [
                            Number(value).toLocaleString("pl-PL", {
                              style: "currency",
                              currency: "PLN",
                            }),
                            name,
                          ]
                        : [value, name]
                    }
                  />
                  <Legend />
                  <Bar
                    yAxisId="vis"
                    dataKey="visits"
                    name="Wizyty"
                    fill="#c7d2fe"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="rev"
                    type="monotone"
                    dataKey="revenuePLN"
                    name="Przychód"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Statusy + metody płatności + heatmapa */}
          <div className="hidden gap-4 md:grid xl:grid-cols-3">
            <Card className="p-4">
              <div className="mb-2 font-medium">Wizyty wg statusu</div>
              {statusData.length === 0 ? (
                <div className="text-sm text-zinc-500">Brak wizyt w okresie.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {statusData.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-2 font-medium">Płatności wg metody</div>
              {methodData.length === 0 ? (
                <div className="text-sm text-zinc-500">Brak płatności w okresie.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={methodData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {methodData.map((m: any, i: number) => (
                          <Cell key={m.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) =>
                          Number(value).toLocaleString("pl-PL", {
                            style: "currency",
                            currency: "PLN",
                          })
                        }
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-3 font-medium">
                Obłożenie — dni i godziny{" "}
                <span className="text-xs font-normal text-zinc-500">(bez odwołanych)</span>
              </div>
              <div className="overflow-auto">
                <div className="min-w-[320px]">
                  <div className="grid grid-cols-[28px_repeat(14,1fr)] gap-0.5 text-[10px] text-zinc-500">
                    <div />
                    {HEATMAP_HOURS.map((h) => (
                      <div key={h} className="text-center">
                        {h}
                      </div>
                    ))}
                    {DOW_LABELS.map((d, di) => (
                      <React.Fragment key={d}>
                        <div className="flex items-center">{d}</div>
                        {HEATMAP_HOURS.map((h) => {
                          const v = heatmap[di]?.[h] ?? 0;
                          const alpha = v === 0 ? 0 : 0.15 + 0.85 * (v / heatMax);
                          return (
                            <div
                              key={h}
                              title={`${d} ${h}:00 — ${v} wizyt`}
                              className="aspect-square rounded-sm border border-zinc-100 dark:border-zinc-800"
                              style={{ backgroundColor: `rgba(16,185,129,${alpha})` }}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Ranking specjalistów */}
          <Card className="hidden p-4 md:block">
            <div className="mb-3 font-medium">Ranking specjalistów</div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Specjalista</TableHead>
                    <TableHead className="text-right">Wizyty</TableHead>
                    <TableHead className="text-right">Przychód</TableHead>
                    <TableHead className="text-right">Śr. cena</TableHead>
                    <TableHead className="text-right">Koszt materiałów</TableHead>
                    <TableHead className="text-right">Marża</TableHead>
                    <TableHead className="text-right">% odwołań i no-show</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.specialists ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-zinc-500">
                        Brak danych w okresie.
                      </TableCell>
                    </TableRow>
                  )}
                  {(data.specialists ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.appointments}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPLNFromGrosze(s.revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPLNFromGrosze(s.avgPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPLNFromGrosze(s.materialsCost)}
                      </TableCell>
                      <TableCell className="text-right">{formatPLNFromGrosze(s.margin)}</TableCell>
                      <TableCell className="text-right">
                        {(s.cancelNoShowRate * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Top usługi i preparaty */}
          <div className="hidden gap-4 md:grid xl:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 font-medium">Top 10 usług wg przychodu</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usługa</TableHead>
                    <TableHead className="text-right">Wykonania</TableHead>
                    <TableHead className="text-right">Przychód</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.topServices ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-zinc-500">
                        Brak danych w okresie.
                      </TableCell>
                    </TableRow>
                  )}
                  {(data.topServices ?? []).map((s: any) => (
                    <TableRow key={s.name}>
                      <TableCell className="max-w-[280px] truncate" title={s.name}>
                        {s.name}
                      </TableCell>
                      <TableCell className="text-right">{s.count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPLNFromGrosze(s.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-4">
              <div className="mb-3 font-medium">Top 10 preparatów wg wartości zużycia</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Preparat</TableHead>
                    <TableHead className="text-right">Ilość</TableHead>
                    <TableHead className="text-right">Koszt zakupu</TableHead>
                    <TableHead className="text-right">Wartość sprzedaży</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.topProducts ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-zinc-500">
                        Brak danych w okresie.
                      </TableCell>
                    </TableRow>
                  )}
                  {(data.topProducts ?? []).map((p: any) => (
                    <TableRow key={p.name}>
                      <TableCell className="max-w-[240px] truncate" title={p.name}>
                        {p.name}
                      </TableCell>
                      <TableCell className="text-right">{p.quantity}</TableCell>
                      <TableCell className="text-right">{formatPLNFromGrosze(p.cost)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPLNFromGrosze(p.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
