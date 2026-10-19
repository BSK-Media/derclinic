import { effectivePercent, loadPercentOverrides } from "@/lib/payout-percent";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";

function ymToRange(ym: string) {
  // ym: YYYY-MM
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
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

  const rows = specialists.map((s) => {
    const overrides = overridesBySpecialist.get(s.id);
    const appts = appointments.filter((a) => a.specialistId === s.id);
    const revenue = appts.reduce((sum, a) => sum + (a.priceFinal ?? a.priceEstimate ?? 0), 0);
    const materials = appts.flatMap((a) => a.consumptions);
    const materialCost = materials.reduce((sum, c) => {
      const purchase = c.product.purchasePrice ?? 0;
      const q = Math.abs(parseFloat(String(c.quantity)));
      return sum + Math.round(purchase * q);
    }, 0);
    // Procent liczony per wizyta: wyjątek od zabiegu nadpisuje ogólny procent pracownika.
    const percentOf = (a: (typeof appts)[number]) => effectivePercent(s.payoutPercent ?? 50, overrides, a.serviceId);
    const payout = appts.reduce(
      (sum, a) => sum + Math.round(((a.priceFinal ?? a.priceEstimate ?? 0) * percentOf(a)) / 100),
      0,
    );
    const profit = revenue - materialCost;
    const payoutFromProfit = appts.reduce((sum, a) => {
      const cost = a.consumptions.reduce(
        (acc, c) => acc + Math.round((c.product.purchasePrice ?? 0) * Math.abs(parseFloat(String(c.quantity)))),
        0,
      );
      return sum + Math.round((((a.priceFinal ?? a.priceEstimate ?? 0) - cost) * percentOf(a)) / 100);
    }, 0);
    return {
      specialistId: s.id,
      name: s.name,
      payoutPercent: s.payoutPercent,
      appointments: appts.length,
      revenue,
      materialCost,
      profit,
      payout,
      payoutFromProfit,
    };
  });

  return NextResponse.json({ ok: true, month: ym, start, end, rows });
}
