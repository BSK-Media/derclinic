import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { normalizeSidebarPermissions } from "@/lib/sidebar-permissions";

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
      sidebarPermissions: true,
    },
  });
  if (!specialist) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  const appointments = await prisma.appointment.findMany({
    where: { specialistId: params.id, startsAt: { gte: start } },
    orderBy: { startsAt: "desc" },
    take: 1000,
    include: {
      patient: { select: { id: true, name: true } },
      service: { select: { id: true, name: true } },
      consumptions: { include: { product: { select: { id: true, name: true, purchasePrice: true } } } },
    },
  });

  const percent = specialist.payoutPercent ?? 0;

  const rows = appointments.map((a) => {
    const materialCost = a.consumptions.reduce((sum, c) => {
      const purchase = c.product.purchasePrice ?? 0;
      const q = Math.abs(parseFloat(String(c.quantity)));
      return sum + Math.round(purchase * q);
    }, 0);
    const revenue = a.priceFinal ?? a.priceEstimate ?? 0;
    // Nowy model rozliczeń: baza = przychód − materiały, wypłata = baza × % pracownika
    const base = revenue - materialCost;
    const payout = Math.round((base * percent) / 100);

    return {
      id: a.id,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      approvalStatus: a.approvalStatus,
      patient: a.patient,
      service: a.service,
      customServiceName: a.customServiceName,
      revenue,
      materialCost,
      materials: a.consumptions.map((c) => ({
        id: c.id,
        productName: c.product.name,
        quantity: String(c.quantity),
        cost: Math.round((c.product.purchasePrice ?? 0) * Math.abs(parseFloat(String(c.quantity)))),
      })),
      base,
      payout,
    };
  });

  // Statystyki i wypłata liczone wyłącznie z wizyt zakończonych ORAZ zaakceptowanych przez recepcję/admina
  const completed = rows.filter((r) => r.status === "COMPLETED" && r.approvalStatus === "APPROVED");
  const revenue = completed.reduce((s, r) => s + r.revenue, 0);
  const materialCost = completed.reduce((s, r) => s + r.materialCost, 0);
  const payout = completed.reduce((s, r) => s + r.payout, 0);
  const profit = revenue - materialCost - payout;

  return NextResponse.json({
    ok: true,
    range,
    start,
    specialist: {
      ...specialist,
      sidebarPermissions: normalizeSidebarPermissions(specialist.role, specialist.sidebarPermissions),
    },
    stats: {
      appointmentsTotal: rows.length,
      appointmentsCompleted: completed.length,
      revenue,
      materialCost,
      payout,
      profit,
      percent,
    },
    appointments: rows,
  });
}
