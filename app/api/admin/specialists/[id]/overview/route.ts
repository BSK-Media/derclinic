import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

type RangeKey = "today" | "7d" | "30d";

// Początek bieżącej doby w strefie Europe/Warsaw (serwer działa w UTC)
function warsawDayStart(): Date {
  const now = new Date();
  const warsawNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
  const offsetMs = now.getTime() - warsawNow.getTime();
  const start = new Date(warsawNow);
  start.setHours(0, 0, 0, 0);
  return new Date(start.getTime() + offsetMs);
}

function rangeToStart(range: RangeKey): Date {
  if (range === "today") return warsawDayStart();
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const rangeParam = url.searchParams.get("range");
  const range: RangeKey = rangeParam === "today" || rangeParam === "7d" || rangeParam === "30d" ? rangeParam : "30d";
  const start = rangeToStart(range);

  const specialist = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      avatarUrl: true,
      jobTitle: true,
      specialization: true,
      location: true,
      baseRate: true,
      payoutPercent: true,
    },
  });
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  const [appointments, rates] = await Promise.all([
    prisma.appointment.findMany({
      where: { specialistId: params.id, startsAt: { gte: start } },
      orderBy: { startsAt: "desc" },
      take: 1000,
      include: {
        patient: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        consumptions: { include: { product: { select: { id: true, name: true, purchasePrice: true } } } },
      },
    }),
    prisma.specialistServiceRate.findMany({ where: { specialistId: params.id } }),
  ]);

  const rateByService = new Map(rates.map((r) => [r.serviceId, r.amount]));

  const rows = appointments.map((a) => {
    const materialCost = a.consumptions.reduce((sum, c) => {
      const purchase = c.product.purchasePrice ?? 0;
      const q = Math.abs(parseFloat(String(c.quantity)));
      return sum + Math.round(purchase * q);
    }, 0);
    const revenue = a.priceFinal ?? a.priceEstimate ?? 0;
    const rate = rateByService.get(a.serviceId) ?? specialist.baseRate ?? null; // grosze lub brak
    const payout = rate === null ? null : rate - materialCost; // stawka minus zużyte materiały

    return {
      id: a.id,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      patient: a.patient,
      service: a.service,
      revenue,
      materialCost,
      materials: a.consumptions.map((c) => ({
        id: c.id,
        productName: c.product.name,
        quantity: String(c.quantity),
        cost: Math.round((c.product.purchasePrice ?? 0) * Math.abs(parseFloat(String(c.quantity)))),
      })),
      rate,
      payout,
    };
  });

  // Statystyki liczone wyłącznie z wizyt zakończonych (COMPLETED)
  const completed = rows.filter((r) => r.status === "COMPLETED");
  const revenue = completed.reduce((s, r) => s + r.revenue, 0);
  const materialCost = completed.reduce((s, r) => s + r.materialCost, 0);
  const payout = completed.reduce((s, r) => s + (r.payout ?? 0), 0);
  const missingRateCount = completed.filter((r) => r.rate === null).length;
  const profit = revenue - materialCost - payout;

  return NextResponse.json({
    ok: true,
    range,
    start,
    specialist,
    stats: {
      appointmentsTotal: rows.length,
      appointmentsCompleted: completed.length,
      revenue,
      materialCost,
      payout,
      profit,
      missingRateCount,
    },
    appointments: rows,
  });
}
