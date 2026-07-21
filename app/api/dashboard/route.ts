import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const toNum = (v: unknown) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

const MONTH_LABELS = [
  "Sty",
  "Lut",
  "Mar",
  "Kwi",
  "Maj",
  "Cze",
  "Lip",
  "Sie",
  "Wrz",
  "Paź",
  "Lis",
  "Gru",
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

type ApptRow = {
  startsAt: Date;
  status: string;
  approvalStatus: string;
  priceFinal: number | null;
  priceEstimate: number | null;
  service: { price: number | null; category: string | null; name: string } | null;
  customServiceName: string | null;
};

const apptPrice = (a: ApptRow) => a.priceFinal ?? a.priceEstimate ?? a.service?.price ?? 0;
const isBillable = (a: { status: string; approvalStatus: string }) =>
  a.status === "COMPLETED" && a.approvalStatus === "APPROVED";

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "30d";
  const locationWhere = scopedLocationWhere(user!);
  const warehouseScope = user!.locationScopeId
    ? { warehouse: { locationId: user!.locationScopeId } }
    : {};

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600 * 1000);
  const yesterdayEnd = new Date(todayEnd.getTime() - 24 * 3600 * 1000);
  const last30Start = startOfDay(new Date(now.getTime() - 29 * 24 * 3600 * 1000));

  // Zakres wykresu
  let chartStart: Date;
  let chartGranularity: "day" | "month" = "day";
  if (period === "7d") chartStart = startOfDay(new Date(now.getTime() - 6 * 24 * 3600 * 1000));
  else if (period === "month")
    chartStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  else if (period === "year") {
    chartStart = startOfDay(new Date(now.getFullYear(), 0, 1));
    chartGranularity = "month";
  } else chartStart = last30Start;

  const dataStart = new Date(Math.min(chartStart.getTime(), last30Start.getTime()));

  const [
    appointments,
    todayCount,
    yesterdayCount,
    newPatientsToday,
    newPatientsYesterday,
    stocks,
    expiringLots,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { deletedAt: null, startsAt: { gte: dataStart, lte: todayEnd }, ...locationWhere },
      select: {
        startsAt: true,
        status: true,
        approvalStatus: true,
        priceFinal: true,
        priceEstimate: true,
        customServiceName: true,
        service: { select: { price: true, category: true, name: true } },
      },
      take: 30000,
    }),
    prisma.appointment.count({
      where: {
        deletedAt: null,
        status: { not: "CANCELED" },
        startsAt: { gte: todayStart, lte: todayEnd },
        ...locationWhere,
      },
    }),
    prisma.appointment.count({
      where: {
        deletedAt: null,
        status: { not: "CANCELED" },
        startsAt: { gte: yesterdayStart, lte: yesterdayEnd },
        ...locationWhere,
      },
    }),
    prisma.patient.count({ where: { createdAt: { gte: todayStart, lte: todayEnd }, ...locationWhere } }),
    prisma.patient.count({ where: { createdAt: { gte: yesterdayStart, lte: yesterdayEnd }, ...locationWhere } }),
    prisma.stock.findMany({
      where: warehouseScope,
      select: { productId: true, quantity: true },
      take: 20000,
    }),
    prisma.productLot.findMany({
      where: {
        ...warehouseScope,
        quantity: { gt: 0 },
        expiryDate: {
          not: null,
          lte: new Date(now.getTime() + 60 * 24 * 3600 * 1000),
        },
      },
      select: { productId: true },
      take: 5000,
    }),
  ]);

  const rows = appointments as unknown as ApptRow[];

  // ── KPI: dzisiejszy przychód vs wczoraj ───────────────────────────────
  const revenueBetween = (from: Date, to: Date) =>
    rows
      .filter((a) => isBillable(a) && a.startsAt >= from && a.startsAt <= to)
      .reduce((s, a) => s + apptPrice(a), 0);

  const todayRevenue = revenueBetween(todayStart, todayEnd);
  const yesterdayRevenue = revenueBetween(yesterdayStart, yesterdayEnd);

  const pct = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const todayRevenueDeltaPct =
    yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : todayRevenue > 0
        ? 100
        : 0;

  // ── Alerty magazynowe: preparaty blisko terminu (≤60 dni) ─────────────
  const expiringProducts = new Set(expiringLots.map((l: { productId: string }) => l.productId));
  const inventoryAlerts = expiringProducts.size;

  // ── Wykres przychód + wizyty ──────────────────────────────────────────
  const chartRows = rows.filter((a) => a.startsAt >= chartStart);
  const seriesMap = new Map<string, { day: string; revenue: number; visits: number }>();
  if (chartGranularity === "day") {
    for (
      let t = new Date(chartStart);
      t <= todayEnd;
      t = new Date(t.getTime() + 24 * 3600 * 1000)
    ) {
      const key = `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
      seriesMap.set(key, { day: String(t.getDate()), revenue: 0, visits: 0 });
    }
  } else {
    for (let m = 0; m <= now.getMonth(); m += 1) {
      seriesMap.set(`m-${m}`, { day: MONTH_LABELS[m], revenue: 0, visits: 0 });
    }
  }
  for (const a of chartRows) {
    if (!isBillable(a)) continue;
    const d = new Date(a.startsAt);
    const key =
      chartGranularity === "day"
        ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        : `m-${d.getMonth()}`;
    const row = seriesMap.get(key);
    if (!row) continue;
    row.revenue += Math.round(apptPrice(a) / 100); // złote na osi wykresu
    row.visits += 1;
  }
  const chart = Array.from(seriesMap.values());

  // ── Struktura i popularność zabiegów (ostatnie 30 dni, rozliczone) ────
  const last30Billable = rows.filter((a) => isBillable(a) && a.startsAt >= last30Start);
  const byService = new Map<string, { name: string; count: number; revenue: number }>();
  const byCategory = new Map<string, number>();
  for (const a of last30Billable) {
    const name = a.customServiceName || a.service?.name || "—";
    const svc = byService.get(name) ?? { name, count: 0, revenue: 0 };
    svc.count += 1;
    svc.revenue += apptPrice(a);
    byService.set(name, svc);

    const cat = a.service?.category?.trim() || "Inne";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }
  const totalBillable30 = last30Billable.length;

  const donutSorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const donutTop = donutSorted.slice(0, 3);
  const donutRest = donutSorted.slice(3).reduce((s, [, v]) => s + v, 0);
  const donut = [
    ...donutTop.map(([name, value]) => ({
      name,
      value: totalBillable30 > 0 ? Math.round((value / totalBillable30) * 100) : 0,
    })),
    ...(donutRest > 0 && totalBillable30 > 0
      ? [{ name: "Inne", value: Math.round((donutRest / totalBillable30) * 100) }]
      : []),
  ];

  const topServices = Array.from(byService.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((s) => ({
      name: s.name,
      volume: totalBillable30 > 0 ? Math.round((s.count / totalBillable30) * 100) : 0,
      revenue: s.revenue,
    }));

  // ── Nadchodzące wizyty dzisiaj ────────────────────────────────────────
  const upcoming = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      status: "SCHEDULED",
      startsAt: { gte: now, lte: todayEnd },
      ...locationWhere,
    },
    select: {
      id: true,
      startsAt: true,
      customServiceName: true,
      patient: { select: { name: true } },
      service: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
    take: 8,
  });

  // ── Status magazynu: top zużywane preparaty (30 dni) + poziom zapasu ──
  const consumptions = await prisma.consumption.findMany({
    where: { createdAt: { gte: last30Start }, status: "APPLIED", ...warehouseScope },
    select: {
      productId: true,
      quantity: true,
      product: { select: { name: true, unit: true } },
    },
    take: 20000,
  });
  const usedByProduct = new Map<string, { name: string; unit: string; used: number }>();
  let usedTotal = 0;
  for (const c of consumptions as {
    productId: string;
    quantity: unknown;
    product: { name: string; unit: string };
  }[]) {
    const q = Math.abs(toNum(c.quantity));
    usedTotal += q;
    const row = usedByProduct.get(c.productId) ?? {
      name: c.product.name,
      unit: c.product.unit,
      used: 0,
    };
    row.used += q;
    usedByProduct.set(c.productId, row);
  }
  const stockByProduct = new Map<string, number>();
  for (const s of stocks as { productId: string; quantity: unknown }[]) {
    stockByProduct.set(s.productId, (stockByProduct.get(s.productId) ?? 0) + toNum(s.quantity));
  }
  const inventoryRows = Array.from(usedByProduct.entries()).map(([productId, row]) => {
    const stock = Math.max(0, stockByProduct.get(productId) ?? 0);
    const dailyUsage = row.used / 30;
    const coverageDays = dailyUsage > 0 ? stock / dailyUsage : 0;
    return {
      productId,
      name: row.name,
      unit: row.unit,
      used30: row.used,
      stock,
      wosWeeks: coverageDays / 7,
      coverageDays,
      coveragePercent: Math.max(0, Math.min(100, Math.round((coverageDays / 30) * 100))),
    };
  });

  const mostUsedProducts = [...inventoryRows]
    .sort((a, b) => b.used30 - a.used30 || a.name.localeCompare(b.name, "pl"))
    .slice(0, 10);

  const lowStockProducts = [...inventoryRows]
    .sort(
      (a, b) =>
        a.wosWeeks - b.wosWeeks || b.used30 - a.used30 || a.name.localeCompare(b.name, "pl"),
    )
    .slice(0, 10);

  // Zachowane dla starszego widoku /admin/sales.
  const stockStatus = mostUsedProducts.slice(0, 4).map((row) => ({
    name: row.name,
    share: usedTotal > 0 ? Math.round((row.used30 / usedTotal) * 100) : 0,
    percent: row.coveragePercent,
  }));

  const isAdminUser = user!.role === "ADMIN";

  return NextResponse.json({
    ok: true,
    kpi: {
      todayVisits: todayCount,
      todayVisitsDeltaPct: pct(todayCount, yesterdayCount),
      todayRevenue: isAdminUser ? todayRevenue : 0,
      todayRevenueDeltaPct: isAdminUser ? todayRevenueDeltaPct : null,
      newPatients: newPatientsToday,
      newPatientsDelta: newPatientsToday - newPatientsYesterday,
      inventoryAlerts,
    },
    chart: isAdminUser ? chart : chart.map((r) => ({ ...r, revenue: 0 })),
    donut,
    topServices: isAdminUser ? topServices : topServices.map((s) => ({ ...s, revenue: 0 })),
    upcoming: upcoming.map(
      (a: {
        id: string;
        startsAt: Date;
        customServiceName: string | null;
        patient: { name: string };
        service: { name: string };
      }) => ({
        id: a.id,
        patient: a.patient.name,
        time: new Date(a.startsAt).toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        procedure: a.customServiceName || a.service.name,
      }),
    ),
    stockStatus,
    mostUsedProducts,
    lowStockProducts,
  });
}
