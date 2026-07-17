import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { resolveSettlementRange } from "@/lib/settlement-range";

async function servicePatientsResponse(url: URL, serviceId: string, viewerRole: string) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const hasDateRange = Boolean(from || to);

  let startsAt: { gte: Date; lt: Date } | undefined;
  if (hasDateRange) {
    if (!from || !to) {
      return NextResponse.json({ ok: false, message: "Podaj pełny zakres dat" }, { status: 400 });
    }
    const rangeUrl = new URL(url);
    rangeUrl.searchParams.set("range", "custom");
    const resolved = resolveSettlementRange(rangeUrl);
    if (!resolved) {
      return NextResponse.json({ ok: false, message: "Niepoprawny zakres dat" }, { status: 400 });
    }
    startsAt = { gte: resolved.start, lt: resolved.end };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true },
  });
  if (!service) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  }

  const serviceAppointments = await prisma.appointment.findMany({
    where: {
      serviceId,
      status: "COMPLETED",
      approvalStatus: "APPROVED",
      deletedAt: null,
      startsAt,
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
  if (viewerRole !== "ADMIN" || servicePatients.length === 0) {
    return NextResponse.json({
      ok: true,
      viewerRole,
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
    viewerRole,
    patients: servicePatients.map((patient) => ({
      ...patient,
      totalSpentClinic: clinicSpendByPatient.get(patient.id) ?? 0,
    })),
  });
}

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const patientsFor = url.searchParams.get("patientsFor");
  if (patientsFor) return servicePatientsResponse(url, patientsFor, user!.role);

  const [services, products, specialists] = await Promise.all([
    prisma.service.findMany({
      orderBy: { name: "asc" },
      include: {
        suggestedProducts: { include: { product: true } },
        specialistAssignments: { select: { specialistId: true } },
      },
    }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "SPECIALIST" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    viewerRole: user!.role,
    services,
    products,
    specialists,
  });
}

const UpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(2, "Podaj nazwę usługi").max(200).optional(),
    category: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
    price: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const { id, ...changes } = parsed.data;
  const existing = await prisma.service.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  }

  const service = await prisma.service.update({ where: { id }, data: changes });
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Service",
    entityId: service.id,
    data: changes,
  });

  return NextResponse.json({ ok: true, service });
}

const CreateSchema = z.object({
  name: z.string().min(2),
  category: z.string().optional().nullable(),
  description: z.string().optional().or(z.literal("")),
  durationMin: z.number().int().min(5).max(480).optional(),
  price: z.number().int().optional().nullable(),
  specialistIds: z.array(z.string().min(1)).optional(),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const s = await prisma.service.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category ? parsed.data.category : null,
      description: parsed.data.description ? parsed.data.description : null,
      durationMin: parsed.data.durationMin ?? 30,
      price: parsed.data.price ?? null,
    },
  });

  // Przypisanie usługi wskazanym specjalistom (tylko istniejącym, rola SPECIALIST)
  const specialistIds = [...new Set(parsed.data.specialistIds ?? [])];
  if (specialistIds.length > 0) {
    const validSpecialists = await prisma.user.findMany({
      where: { id: { in: specialistIds }, role: "SPECIALIST" },
      select: { id: true },
    });
    if (validSpecialists.length > 0) {
      await prisma.specialistService.createMany({
        data: validSpecialists.map((sp) => ({ specialistId: sp.id, serviceId: s.id })),
        skipDuplicates: true,
      });
    }
  }

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Service",
    entityId: s.id,
    data: { specialistIds },
  });

  return NextResponse.json({ ok: true, service: s });
}
