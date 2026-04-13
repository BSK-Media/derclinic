import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

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
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const ym = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const { start, end } = ymToRange(ym);

  const specialists = await prisma.user.findMany({ where: { role: "SPECIALIST" }, orderBy: { name: "asc" } });
  const specialistIds = specialists.map((s) => s.id);

  const appointments = await prisma.appointment.findMany({
    where: { specialistId: { in: specialistIds }, status: "COMPLETED", startsAt: { gte: start, lt: end } },
    include: { consumptions: { include: { product: true } } },
    take: 5000,
  });

  const rows = specialists.map((s) => {
    const appts = appointments.filter((a) => a.specialistId === s.id);
    const revenue = appts.reduce((sum, a) => sum + (a.priceFinal ?? a.priceEstimate ?? 0), 0);
    const materials = appts.flatMap((a) => a.consumptions);
    const materialCost = materials.reduce((sum, c) => {
      const purchase = c.product.purchasePrice ?? 0;
      const q = Math.abs(parseFloat(String(c.quantity)));
      return sum + Math.round(purchase * q);
    }, 0);
    const payout = Math.round((revenue * (s.payoutPercent ?? 50)) / 100);
    const profit = revenue - materialCost;
    const payoutFromProfit = Math.round((profit * (s.payoutPercent ?? 50)) / 100);
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
