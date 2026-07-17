import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { resolveSettlementRange } from "@/lib/settlement-range";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const requestUrl = new URL(req.url);
  const from = requestUrl.searchParams.get("from");
  const to = requestUrl.searchParams.get("to");
  const hasDateRange = Boolean(from || to);

  let startsAt: { gte: Date; lt: Date } | undefined;
  if (hasDateRange) {
    if (!from || !to) {
      return NextResponse.json({ ok: false, message: "Podaj pełny zakres dat" }, { status: 400 });
    }
    const rangeUrl = new URL(requestUrl);
    rangeUrl.searchParams.set("range", "custom");
    const resolved = resolveSettlementRange(rangeUrl);
    if (!resolved) {
      return NextResponse.json({ ok: false, message: "Niepoprawny zakres dat" }, { status: 400 });
    }
    startsAt = { gte: resolved.start, lt: resolved.end };
  }

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!patient) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono pacjenta" }, { status: 404 });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      patientId: params.id,
      status: "COMPLETED",
      approvalStatus: "APPROVED",
      deletedAt: null,
      startsAt,
    },
    orderBy: { startsAt: "desc" },
    select: {
      startsAt: true,
      priceFinal: true,
      priceEstimate: true,
      serviceId: true,
      customServiceName: true,
      service: { select: { name: true } },
    },
    take: 5000,
  });

  const totalSpent = appointments.reduce(
    (sum, appointment) => sum + (appointment.priceFinal ?? appointment.priceEstimate ?? 0),
    0,
  );

  const latestByService = new Map<
    string,
    { serviceName: string; lastVisitAt: Date; visitsCount: number }
  >();
  for (const appointment of appointments) {
    const serviceName = appointment.customServiceName || appointment.service.name;
    const key = appointment.customServiceName
      ? `custom:${appointment.customServiceName.trim().toLocaleLowerCase("pl-PL")}`
      : appointment.serviceId;
    const existing = latestByService.get(key);
    if (!existing) {
      latestByService.set(key, {
        serviceName,
        lastVisitAt: appointment.startsAt,
        visitsCount: 1,
      });
      continue;
    }
    existing.visitsCount += 1;
    if (appointment.startsAt > existing.lastVisitAt) {
      existing.lastVisitAt = appointment.startsAt;
    }
  }

  const latestTreatments = [...latestByService.entries()]
    .map(([serviceKey, treatment]) => ({ serviceKey, ...treatment }))
    .sort((left, right) => right.lastVisitAt.getTime() - left.lastVisitAt.getTime());

  return NextResponse.json({
    ok: true,
    stats: {
      totalSpent,
      treatmentsCount: appointments.length,
      latestTreatments,
    },
  });
}
