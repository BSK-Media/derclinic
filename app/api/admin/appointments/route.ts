import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

function parseRangeDate(value: string | null, fallback: Date, includeWholeDay = false) {
  if (!value) return fallback;
  const date = new Date(value);
  if (includeWholeDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const deletedOnly = url.searchParams.get("deleted") === "only";

  const fromDt = parseRangeDate(from, new Date(Date.now() - 1000 * 60 * 60 * 24 * 7));
  const toDt = parseRangeDate(to, new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), true);

  // Porządkujemy również starsze dane: akceptacja dotyczy wyłącznie wizyty zakończonej.
  // Dzięki temu zaplanowana, odwołana i nieobecność zawsze mają puste pole akceptacji.
  await prisma.appointment.updateMany({
    where: {
      status: { in: ["SCHEDULED", "CANCELED", "NO_SHOW"] },
      OR: [
        { approvalStatus: { not: "PENDING" } },
        { approvedAt: { not: null } },
        { approvedById: { not: null } },
        { rejectionReason: { not: null } },
      ],
    },
    data: {
      approvalStatus: "PENDING",
      approvedAt: null,
      approvedById: null,
      rejectionReason: null,
    },
  });

  const [appointments, patients, specialists, services] = await Promise.all([
    prisma.appointment.findMany({
      where: deletedOnly
        ? { deletedAt: { not: null } }
        : { deletedAt: null, startsAt: { gte: fromDt, lt: toDt } },
      orderBy: deletedOnly ? { deletedAt: "desc" } : { startsAt: "asc" },
      include: {
        patient: true,
        specialist: { select: { id: true, name: true, login: true } },
        service: true,
        deletedBy: { select: { id: true, name: true, login: true } },
        consumptions: { include: { product: true, warehouse: true } },
        payments: true,
      },
      take: 500,
    }),
    prisma.patient.findMany({ orderBy: { name: "asc" }, take: 500 }),
    prisma.user.findMany({
      where: { role: "SPECIALIST" },
      orderBy: { name: "asc" },
      include: { assignedServices: { select: { serviceId: true } } },
    }),
    prisma.service.findMany({ orderBy: { name: "asc" } }),
  ]);

  const shapedSpecialists = specialists.map((s) => ({
    id: s.id,
    name: s.name,
    login: s.login,
    serviceIds: s.assignedServices.map((a) => a.serviceId),
  }));

  return NextResponse.json({
    ok: true,
    appointments,
    patients,
    specialists: shapedSpecialists,
    services,
  });
}

const NewPatientSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(3).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
});

const CreateSchema = z
  .object({
    patientId: z.string().min(1).optional().nullable(),
    // Nowy klient zakładany bezpośrednio z formularza rezerwacji (admin/recepcja)
    newPatient: NewPatientSchema.optional().nullable(),
    specialistId: z.string().min(1),
    serviceId: z.string().min(1),
    startsAt: z.string().min(1),
    durationMin: z.number().int().min(5).max(480),
    priceFinal: z.number().int().optional().nullable(),
    // Zgodność ze starszym formularzem — ta wartość również jest traktowana jako cena końcowa.
    priceEstimate: z.number().int().optional().nullable(),
    note: z.string().optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (!value.patientId && !value.newPatient) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["patientId"],
        message: "Wybierz pacjenta lub podaj dane nowego klienta",
      });
    }
  });

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt);
  endsAt.setMinutes(endsAt.getMinutes() + parsed.data.durationMin);

  const service = await prisma.service.findUnique({
    where: { id: parsed.data.serviceId },
    select: { price: true },
  });
  if (!service) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono usługi" }, { status: 404 });
  }
  const standardPrice = service.price;
  const finalPrice = parsed.data.priceFinal ?? parsed.data.priceEstimate ?? standardPrice;

  let patientId = parsed.data.patientId ?? null;
  if (!patientId && parsed.data.newPatient) {
    const newPatient = parsed.data.newPatient;
    const patientName = `${newPatient.firstName} ${newPatient.lastName}`
      .replace(/\s+/g, " ")
      .trim();
    const phone = normalizePhone(newPatient.phone);
    const email = newPatient.email?.trim() || null;

    // Ten sam numer telefonu = ten sam klient — nie duplikujemy kartotek
    const existingPatient = await prisma.patient.findFirst({
      where: { phone },
      orderBy: { updatedAt: "desc" },
      select: { id: true, email: true },
    });
    if (existingPatient) {
      patientId = existingPatient.id;
      if (email && !existingPatient.email) {
        await prisma.patient.update({ where: { id: existingPatient.id }, data: { email } });
      }
    } else {
      const createdPatient = await prisma.patient.create({
        data: { name: patientName, phone, email },
        select: { id: true },
      });
      patientId = createdPatient.id;
      await logAudit({
        actorId: user!.id,
        action: "CREATE",
        entity: "Patient",
        entityId: createdPatient.id,
      });
    }
  }
  if (!patientId) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }

  const appt = await prisma.appointment.create({
    data: {
      patientId,
      specialistId: parsed.data.specialistId,
      serviceId: parsed.data.serviceId,
      startsAt,
      endsAt,
      approvalStatus: "PENDING",
      // priceEstimate przechowuje cenę standardową z chwili rezerwacji, priceFinal jej ewentualną zmianę.
      priceEstimate: standardPrice,
      priceFinal: finalPrice,
      note: parsed.data.note ? parsed.data.note : null,
    },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Appointment", entityId: appt.id });

  return NextResponse.json({ ok: true, appointment: appt });
}
