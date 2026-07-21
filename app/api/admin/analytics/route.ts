import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const toNum = (v: unknown) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

function parseDateParam(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 29 * 24 * 3600 * 1000);
  defaultFrom.setHours(0, 0, 0, 0);
  const from = parseDateParam(url.searchParams.get("from"), defaultFrom);
  const toRaw = parseDateParam(url.searchParams.get("to"), now);
  const to = new Date(toRaw);
  to.setHours(23, 59, 59, 999);
  const specialistId = url.searchParams.get("specialistId") || null;
  const locationId = url.searchParams.get("locationId") || null;

  // Poprzedni okres o tej samej długości (do porównań %)
  const rangeMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - rangeMs);

  const baseWhere = {
    deletedAt: null,
    ...(specialistId ? { specialistId } : {}),
    ...(locationId
      ? locationId === "grodzisk-mazowiecki"
        ? { OR: [{ locationId }, { locationId: null }] }
        : { locationId }
      : {}),
  } as const;

  const patientLocationWhere = locationId
    ? locationId === "grodzisk-mazowiecki"
      ? { appointments: { some: { OR: [{ locationId }, { locationId: null }] } } }
      : { appointments: { some: { locationId } } }
    : {};

  const [appointments, prevAppointments, specialists, newPatients, prevNewPatients] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { ...baseWhere, startsAt: { gte: from, lte: to } },
        select: {
          id: true,
          startsAt: true,
          status: true,
          approvalStatus: true,
          specialistId: true,
          serviceId: true,
          customServiceName: true,
          priceFinal: true,
          priceEstimate: true,
          service: { select: { id: true, name: true, price: true } },
          specialist: { select: { id: true, name: true } },
          payments: { select: { amount: true, method: true, createdAt: true } },
          consumptions: {
            select: {
              status: true,
              quantity: true,
              product: {
                select: { id: true, name: true, unit: true, salePrice: true, purchasePrice: true },
              },
            },
          },
        },
        take: 20000,
      }),
      prisma.appointment.findMany({
        where: { ...baseWhere, startsAt: { gte: prevFrom, lte: prevTo } },
        select: {
          status: true,
          approvalStatus: true,
          priceFinal: true,
          priceEstimate: true,
          service: { select: { price: true } },
        },
        take: 20000,
      }),
      prisma.user.findMany({
        where: { role: "SPECIALIST" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.patient.count({
        where: { createdAt: { gte: from, lte: to }, ...patientLocationWhere },
      }),
      prisma.patient.count({
        where: { createdAt: { gte: prevFrom, lte: prevTo }, ...patientLocationWhere },
      }),
    ]);

  const apptPrice = (a: {
    priceFinal: number | null;
    priceEstimate: number | null;
    service: { price: number | null } | null;
  }) => a.priceFinal ?? a.priceEstimate ?? a.service?.price ?? 0;

  const isBillable = (a: { status: string; approvalStatus: string }) =>
    a.status === "COMPLETED" && a.approvalStatus === "APPROVED";

  const billable = appointments.filter(isBillable);
  const prevBillable = prevAppointments.filter(isBillable);

  // ── KPI ────────────────────────────────────────────────────────────────
  const revenue = billable.reduce((s: number, a: (typeof billable)[number]) => s + apptPrice(a), 0);
  const prevRevenue = prevBillable.reduce(
    (s: number, a: (typeof prevBillable)[number]) => s + apptPrice(a),
    0,
  );

  let materialsSaleValue = 0;
  let materialsCost = 0;
  for (const a of billable) {
    for (const c of a.consumptions) {
      if (c.status === "REJECTED") continue;
      const q = Math.abs(toNum(c.quantity));
      materialsSaleValue += Math.round((c.product.salePrice ?? 0) * q);
      materialsCost += Math.round((c.product.purchasePrice ?? 0) * q);
    }
  }
  const margin = revenue - materialsCost;

  const paid = billable.reduce(
    (s: number, a: (typeof billable)[number]) =>
      s + a.payments.reduce((x: number, p: { amount: number | null }) => x + (p.amount ?? 0), 0),
    0,
  );
  const outstanding = Math.max(0, revenue - paid);

  const statusCounts = { COMPLETED: 0, SCHEDULED: 0, CANCELED: 0, NO_SHOW: 0 };
  let pendingApproval = 0;
  let rejected = 0;
  for (const a of appointments) {
    if (a.status === "COMPLETED") {
      if (a.approvalStatus === "REJECTED") rejected += 1;
      else {
        statusCounts.COMPLETED += 1;
        if (a.approvalStatus === "PENDING") pendingApproval += 1;
      }
    } else if (a.status in statusCounts) {
      statusCounts[a.status as keyof typeof statusCounts] += 1;
    }
  }
  const closed = statusCounts.COMPLETED + statusCounts.CANCELED + statusCounts.NO_SHOW;
  const noShowRate = closed > 0 ? statusCounts.NO_SHOW / closed : 0;
  const cancelRate = closed > 0 ? statusCounts.CANCELED / closed : 0;

  // ── Przychód w czasie (dziennie do 62 dni, dalej miesięcznie) ─────────
  const byDay = rangeMs <= 62 * 24 * 3600 * 1000;
  const seriesMap = new Map<string, { revenue: number; visits: number }>();
  if (byDay) {
    for (let t = new Date(from); t <= to; t = new Date(t.getTime() + 24 * 3600 * 1000)) {
      seriesMap.set(dayKey(t), { revenue: 0, visits: 0 });
    }
  }
  for (const a of billable) {
    const key = byDay ? dayKey(new Date(a.startsAt)) : monthKey(new Date(a.startsAt));
    const row = seriesMap.get(key) ?? { revenue: 0, visits: 0 };
    row.revenue += apptPrice(a);
    row.visits += 1;
    seriesMap.set(key, row);
  }
  const revenueSeries = Array.from(seriesMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, revenue: v.revenue, visits: v.visits }));

  // ── Metody płatności (wpłaty przy rozliczonych wizytach w okresie) ────
  const methodTotals: Record<string, number> = {};
  for (const a of billable) {
    for (const p of a.payments) {
      methodTotals[p.method] = (methodTotals[p.method] ?? 0) + (p.amount ?? 0);
    }
  }
  const paymentMethods = Object.entries(methodTotals).map(([method, amount]) => ({
    method,
    amount,
  }));

  // ── Ranking specjalistów ──────────────────────────────────────────────
  const bySpec = new Map<
    string,
    {
      name: string;
      appointments: number;
      revenue: number;
      materialsCost: number;
      materialsValue: number;
      canceled: number;
      noShow: number;
      total: number;
    }
  >();
  for (const s of specialists) {
    bySpec.set(s.id, {
      name: s.name,
      appointments: 0,
      revenue: 0,
      materialsCost: 0,
      materialsValue: 0,
      canceled: 0,
      noShow: 0,
      total: 0,
    });
  }
  for (const a of appointments) {
    const row = bySpec.get(a.specialistId) ?? {
      name: a.specialist?.name ?? "—",
      appointments: 0,
      revenue: 0,
      materialsCost: 0,
      materialsValue: 0,
      canceled: 0,
      noShow: 0,
      total: 0,
    };
    row.total += 1;
    if (a.status === "CANCELED") row.canceled += 1;
    if (a.status === "NO_SHOW") row.noShow += 1;
    if (isBillable(a)) {
      row.appointments += 1;
      row.revenue += apptPrice(a);
      for (const c of a.consumptions) {
        if (c.status === "REJECTED") continue;
        const q = Math.abs(toNum(c.quantity));
        row.materialsCost += Math.round((c.product.purchasePrice ?? 0) * q);
        row.materialsValue += Math.round((c.product.salePrice ?? 0) * q);
      }
    }
    bySpec.set(a.specialistId, row);
  }
  const specialistsRanking = Array.from(bySpec.entries())
    .map(([id, r]) => ({
      id,
      name: r.name,
      appointments: r.appointments,
      revenue: r.revenue,
      avgPrice: r.appointments > 0 ? Math.round(r.revenue / r.appointments) : 0,
      materialsCost: r.materialsCost,
      materialsValue: r.materialsValue,
      margin: r.revenue - r.materialsCost,
      cancelNoShowRate: r.total > 0 ? (r.canceled + r.noShow) / r.total : 0,
    }))
    .filter((r) => r.revenue > 0 || r.appointments > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // ── Top usługi ────────────────────────────────────────────────────────
  const byService = new Map<string, { name: string; count: number; revenue: number }>();
  for (const a of billable) {
    const key = a.customServiceName ? `custom:${a.customServiceName}` : a.serviceId;
    const name = a.customServiceName || a.service?.name || "—";
    const row = byService.get(key) ?? { name, count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += apptPrice(a);
    byService.set(key, row);
  }
  const topServices = Array.from(byService.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // ── Top preparaty ─────────────────────────────────────────────────────
  const byProduct = new Map<
    string,
    { name: string; unit: string; quantity: number; cost: number; value: number }
  >();
  for (const a of billable) {
    for (const c of a.consumptions) {
      if (c.status === "REJECTED") continue;
      const q = Math.abs(toNum(c.quantity));
      const row = byProduct.get(c.product.id) ?? {
        name: c.product.name,
        unit: c.product.unit,
        quantity: 0,
        cost: 0,
        value: 0,
      };
      row.quantity += q;
      row.cost += Math.round((c.product.purchasePrice ?? 0) * q);
      row.value += Math.round((c.product.salePrice ?? 0) * q);
      byProduct.set(c.product.id, row);
    }
  }
  const topProducts = Array.from(byProduct.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // ── Heatmapa: dzień tygodnia × godzina ────────────────────────────────
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const a of appointments) {
    if (a.status === "CANCELED") continue;
    const d = new Date(a.startsAt);
    const dow = (d.getDay() + 6) % 7; // 0 = poniedziałek
    heatmap[dow][d.getHours()] += 1;
  }

  return NextResponse.json({
    ok: true,
    range: { from: from.toISOString(), to: to.toISOString() },
    locationId,
    kpi: {
      revenue,
      prevRevenue,
      appointments: billable.length,
      prevAppointments: prevBillable.length,
      avgPrice: billable.length > 0 ? Math.round(revenue / billable.length) : 0,
      prevAvgPrice:
        prevBillable.length > 0 ? Math.round(prevRevenue / prevBillable.length) : 0,
      materialsCost,
      materialsSaleValue,
      margin,
      paid,
      outstanding,
      noShowRate,
      cancelRate,
      pendingApproval,
      rejected,
      newPatients,
      prevNewPatients,
    },
    statusCounts,
    revenueSeries,
    seriesGranularity: byDay ? "day" : "month",
    paymentMethods,
    specialists: specialistsRanking,
    specialistOptions: specialists,
    topServices,
    topProducts,
    heatmap,
  });
}
