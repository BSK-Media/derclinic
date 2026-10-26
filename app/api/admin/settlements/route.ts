import { effectivePercent, loadPercentOverrides } from "@/lib/payout-percent";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { applyMonthOverrides, isMonthKey, warsawMonthRange, type OverrideItem } from "@/lib/specialist-overrides";
import { loadMonthOverrides } from "@/lib/specialist-overrides-db";

function ymToRange(ym: string) {
  // Miesiąc RRRR-MM w czasie warszawskim — tak samo jak szczegóły pracownika i rozliczenia niestandardowe.
  return isMonthKey(ym) ? warsawMonthRange(ym) : warsawMonthRange(new Date().toISOString().slice(0, 7));
}

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const ym = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const { start, end } = ymToRange(ym);

  const specialists = await prisma.user.findMany({
    where: { role: "SPECIALIST", isArchived: false, ...scopedLocationWhere(user!) },
    orderBy: { name: "asc" },
  });
  const specialistIds = specialists.map((s) => s.id);

  const appointments = await prisma.appointment.findMany({
    where: {
      specialistId: { in: specialistIds },
      status: "COMPLETED",
      approvalStatus: "APPROVED",
      deletedAt: null,
      startsAt: { gte: start, lt: end },
      ...scopedLocationWhere(user!),
    },
    include: { consumptions: { include: { product: true } } },
    take: 5000,
  });

  const overridesBySpecialist = await loadPercentOverrides(specialistIds);
  const monthOverrides = await loadMonthOverrides(specialistIds, start, end);

  const rows = specialists.map((s) => {
    const overrides = overridesBySpecialist.get(s.id);
    const appts = appointments.filter((a) => a.specialistId === s.id);
    // Procent liczony per wizyta: wyjątek od zabiegu nadpisuje ogólny procent pracownika.
    const percentOf = (a: (typeof appts)[number]) => effectivePercent(s.payoutPercent ?? 50, overrides, a.serviceId);
    const items: OverrideItem[] = appts.map((a) => {
      const price = a.priceFinal ?? a.priceEstimate ?? 0;
      const cost = a.consumptions.reduce(
        (acc, c) => acc + Math.round((c.product.purchasePrice ?? 0) * Math.abs(parseFloat(String(c.quantity)))),
        0,
      );
      return {
        startsAt: a.startsAt,
        revenue: price,
        materialCost: cost,
        payout: Math.round((price * percentOf(a)) / 100),
        payoutFromProfit: Math.round(((price - cost) * percentOf(a)) / 100),
      };
    });
    // Rozliczenie niestandardowe za ten miesiąc (jeśli jest) zastępuje wartości policzone z wizyt.
    const totals = applyMonthOverrides(items, monthOverrides.get(s.id) ?? []);
    const revenue = totals.revenue;
    const materialCost = totals.materialCost;
    const payout = totals.payout;
    const payoutFromProfit = totals.payoutFromProfit;
    const profit = revenue - materialCost;
    return {
      specialistId: s.id,
      name: s.name,
      payoutPercent: s.payoutPercent,
      appointments: totals.count,
      overriddenMonths: totals.overriddenMonths,
      revenue,
      materialCost,
      profit,
      payout,
      payoutFromProfit,
    };
  });

  return NextResponse.json({ ok: true, month: ym, start, end, rows });
}
