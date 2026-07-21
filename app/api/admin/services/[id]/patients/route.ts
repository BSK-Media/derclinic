import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { resolveSettlementRange } from "@/lib/settlement-range";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
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

  const service = await prisma.service.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!service) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  }

  const serviceAppointments = await prisma.appointment.findMany({
    where: {
      serviceId: params.id,
      status: "COMPLETED",
      approvalStatus: "APPROVED",
      deletedAt: null,
      startsAt,
      ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}),
    },
    orderBy: { startsAt: "desc" },
    select: {
      patientId: true,
      startsAt: true,
      priceFinal: true,
      priceEstimate: true,
      patient: { select: { id: true, name: true, phone: true, email: true } },
    },
    take: 10000,
  });

  const patientsById = new Map<
    string,
    {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      visitsCount: number;
      lastVisitAt: Date;
      totalSpentOnService: number;
    }
  >();

  for (const appointment of serviceAppointments) {
    const existing = patientsById.get(appointment.patientId);
    const appointmentValue = appointment.priceFinal ?? appointment.priceEstimate ?? 0;
    if (!existing) {
      patientsById.set(appointment.patientId, {
        ...appointment.patient,
        visitsCount: 1,
        lastVisitAt: appointment.startsAt,
        totalSpentOnService: appointmentValue,
      });
      continue;
    }
    existing.visitsCount += 1;
    existing.totalSpentOnService += appointmentValue;
    if (appointment.startsAt > existing.lastVisitAt) existing.lastVisitAt = appointment.startsAt;
  }

  const servicePatients = [...patientsById.values()];
  if (user!.role !== "ADMIN" || servicePatients.length === 0) {
    return NextResponse.json({
      ok: true,
      viewerRole: user!.role,
      patients: servicePatients.map((patient) => ({
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
        visitsCount: patient.visitsCount,
        lastVisitAt: patient.lastVisitAt,
      })),
    });
  }

  const clinicAppointments = await prisma.appointment.findMany({
    where: {
      patientId: { in: servicePatients.map((patient) => patient.id) },
      status: "COMPLETED",
      approvalStatus: "APPROVED",
      deletedAt: null,
      startsAt,
      ...(user!.locationScopeId ? { locationId: user!.locationScopeId } : {}),
    },
    select: { patientId: true, priceFinal: true, priceEstimate: true },
    take: 20000,
  });

  const clinicSpendByPatient = new Map<string, number>();
  for (const appointment of clinicAppointments) {
    clinicSpendByPatient.set(
      appointment.patientId,
      (clinicSpendByPatient.get(appointment.patientId) ?? 0) +
        (appointment.priceFinal ?? appointment.priceEstimate ?? 0),
    );
  }

  return NextResponse.json({
    ok: true,
    viewerRole: user!.role,
    patients: servicePatients.map((patient) => ({
      ...patient,
      totalSpentClinic: clinicSpendByPatient.get(patient.id) ?? 0,
    })),
  });
}
