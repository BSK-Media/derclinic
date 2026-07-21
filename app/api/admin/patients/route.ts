import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const patients = await prisma.patient.findMany({
    where: q
      ? {
          ...scopedLocationWhere(user!),
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : scopedLocationWhere(user!),
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (patients.length === 0) {
    return NextResponse.json({ ok: true, viewerRole: user!.role, patients });
  }

  const pastAppointments = await prisma.appointment.findMany({
    where: {
      patientId: { in: patients.map((patient) => patient.id) },
      deletedAt: null,
      startsAt: { lte: new Date() },
      ...scopedLocationWhere(user!),
    },
    select: {
      patientId: true,
      startsAt: true,
      status: true,
      approvalStatus: true,
      priceFinal: true,
      priceEstimate: true,
    },
    orderBy: { startsAt: "desc" },
    take: 20000,
  });

  const totalsByPatient = new Map<
    string,
    { totalSpent: number; completedVisits: number; lastVisitAt: Date | null }
  >();
  for (const appointment of pastAppointments) {
    const totals = totalsByPatient.get(appointment.patientId) ?? {
      totalSpent: 0,
      completedVisits: 0,
      lastVisitAt: null,
    };
    if (!totals.lastVisitAt) totals.lastVisitAt = appointment.startsAt;
    if (appointment.status === "COMPLETED" && appointment.approvalStatus === "APPROVED") {
      totals.completedVisits += 1;
      if (user!.role === "ADMIN") {
        totals.totalSpent += appointment.priceFinal ?? appointment.priceEstimate ?? 0;
      }
    }
    totalsByPatient.set(appointment.patientId, totals);
  }

  const patientsWithStats = patients.map((patient) => ({
    ...patient,
    ...(user!.role === "ADMIN"
      ? { totalSpent: totalsByPatient.get(patient.id)?.totalSpent ?? 0 }
      : {}),
    completedVisits: totalsByPatient.get(patient.id)?.completedVisits ?? 0,
    lastVisitAt: totalsByPatient.get(patient.id)?.lastVisitAt ?? null,
  }));

  return NextResponse.json({ ok: true, viewerRole: user!.role, patients: patientsWithStats });
}

const CreateSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  if (!user!.locationScopeId) {
    return NextResponse.json(
      { ok: false, message: "Przed dodaniem pacjenta wybierz konkretną lokalizację" },
      { status: 400 },
    );
  }
  const p = await prisma.patient.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone ? parsed.data.phone : null,
      email: parsed.data.email ? parsed.data.email : null,
      note: parsed.data.note ? parsed.data.note : null,
      locationId: user!.locationScopeId,
    },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Patient", entityId: p.id });

  return NextResponse.json({ ok: true, patient: p });
}
