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
import { TrendingDown, TrendingUp } from "lucide-react";
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

export function AnalyticsDashboard({
  apiPath = "/api/admin/analytics",
  title = "Analityka",
  description =
    "Przychody, wizyty i zużycie preparatów — dane liczone dla wizyt zakończonych i zaakceptowanych.",
}: {
  apiPath?: string;
  title?: string;
  description?: string;
}) {
  const [period, setPeriod] = React.useState<Period>("30d");
  const [specialistId, setSpecialistId] = React.useState<string>("ALL");

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
      <div className="flex flex-wrap items-end justify-between gap-3">
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

      {isLoading && !data ? (
        <div className="p-6 text-sm text-zinc-500">Ładowanie danych…</div>
      ) : !kpi ? (
        <div className="p-6 text-sm text-zinc-500">Brak danych.</div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                <span className={kpi.pendingApproval > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
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
          <Card className="p-4">
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
                  <YAxis yAxisId="vis" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
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
          <div className="grid gap-4 xl:grid-cols-3">
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
          <Card className="p-4">
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
                      <TableCell className="text-right">{formatPLNFromGrosze(s.avgPrice)}</TableCell>
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
          <div className="grid gap-4 xl:grid-cols-2">
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
