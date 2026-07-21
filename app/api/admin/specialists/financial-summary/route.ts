import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { resolveSettlementRange } from "@/lib/settlement-range";

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const period = resolveSettlementRange(new URL(req.url));
  if (!period) {
    return NextResponse.json({ ok: false, message: "Niepoprawny zakres dat" }, { status: 400 });
  }

  const specialists = await prisma.user.findMany({
    where: { role: "SPECIALIST", ...scopedLocationWhere(user!) },
    orderBy: [{ specialistCode: "asc" }, { name: "asc" }],
    select: {
      id: true,
      specialistCode: true,
      name: true,
      avatarUrl: true,
      jobTitle: true,
      payoutPercent: true,
    },
  });
  const specialistIds = specialists.map((specialist) => specialist.id);

  // Te same kryteria co w szczegółach pracownika:
  // tylko wizyty zakończone ORAZ zaakceptowane przez recepcję/admina
  const appointments = await prisma.appointment.findMany({
    where: {
      specialistId: { in: specialistIds },
      status: "COMPLETED",
      approvalStatus: "APPROVED",
      deletedAt: null,
      startsAt: { gte: period.start, lt: period.end },
      ...scopedLocationWhere(user!),
    },
    select: {
      id: true,
      specialistId: true,
      priceEstimate: true,
      priceFinal: true,
      consumptions: {
        select: {
          quantity: true,
          product: { select: { purchasePrice: true } },
        },
      },
    },
    take: 10000,
  });

  const rows = specialists.map((specialist) => {
    const completed = appointments.filter(
      (appointment) => appointment.specialistId === specialist.id,
    );
    const percent = specialist.payoutPercent ?? 0;

    let revenue = 0;
    let materialCost = 0;
    let payout = 0;

    for (const appointment of completed) {
      const appointmentMaterials = appointment.consumptions.reduce((sum, consumption) => {
        const purchasePrice = consumption.product.purchasePrice ?? 0;
        const quantity = Math.abs(Number(consumption.quantity));
        return sum + Math.round(purchasePrice * quantity);
      }, 0);
      const appointmentRevenue = appointment.priceFinal ?? appointment.priceEstimate ?? 0;

      revenue += appointmentRevenue;
      materialCost += appointmentMaterials;
      // Wypłata = (przychód − materiały) × % pracownika, zaokrąglana per wizyta —
      // identycznie jak w szczegółach pracownika, żeby sumy się zgadzały co do grosza.
      payout += Math.round(((appointmentRevenue - appointmentMaterials) * percent) / 100);
    }

    return {
      specialistId: specialist.id,
      specialistCode: specialist.specialistCode,
      name: specialist.name,
      avatarUrl: specialist.avatarUrl,
      jobTitle: specialist.jobTitle,
      payoutPercent: percent,
      revenue,
      materialCost,
      appointmentsCount: completed.length,
      payout,
    };
  });

  return NextResponse.json({
    ok: true,
    range: period.range,
    start: period.start,
    end: period.end,
    rows,
  });
}
