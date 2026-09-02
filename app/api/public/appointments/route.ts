import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { busyRangesForWarsawDay, computeFreeSlots, slotToUtc } from "@/lib/public-booking";

const RESERVATION_SERVICE_NAME = "__DERCLINIC_REZERWACJA_CZASU__";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

const BodySchema = z.object({
  locationId: z.string().min(1),
  specialistId: z.string().min(1),
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(3).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad("Uzupełnij poprawnie wszystkie wymagane pola");

  const { locationId, specialistId, serviceId, date, time, firstName, lastName, phone, email, note } =
    parsed.data;

  const dateParam = parseDateInput(date);
  if (!dateParam) return bad("Nieprawidłowa data");

  const [location, specialist, service] = await Promise.all([
    prisma.location.findFirst({ where: { id: locationId, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: specialistId, role: "SPECIALIST", isVisible: true, locationId },
      select: {
        id: true,
        workDays: true,
        assignedServices: { select: { serviceId: true } },
      },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, name: { not: RESERVATION_SERVICE_NAME } },
      select: { id: true, price: true, durationMin: true },
    }),
  ]);

  if (!location) return bad("Nie znaleziono wybranej lokalizacji");
  if (!specialist) return bad("Specjalista nie jest dostępny w wybranej lokalizacji");
  if (!service) return bad("Nie znaleziono wybranej usługi");
  if (!specialist.assignedServices.some((a) => a.serviceId === serviceId)) {
    return bad("Ten specjalista nie wykonuje wybranej usługi");
  }

  const now = new Date();

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // Ponowna walidacja dostępności tuż przed zapisem — chroni przed dwoma
      // równoczesnymi rezerwacjami tego samego terminu.
      const dayStart = warsawWallTimeToUtc({ ...dateParam, hour: 0, minute: 0 });
      const dayEnd = warsawWallTimeToUtc({ ...dateParam, hour: 23, minute: 59 });
      const dayStartCheck = new Date(dayStart.getTime() - 4 * 60 * 60 * 1000);
      const dayEndCheck = new Date(dayEnd.getTime() + 4 * 60 * 60 * 1000);

      const [customWorkDays, timeOffs, appointments] = await Promise.all([
        tx.specialistCustomWorkDay.findMany({
          where: { specialistId, date: { gte: dayStartCheck, lte: dayEndCheck } },
          select: { date: true, startTime: true, endTime: true },
        }),
        tx.specialistTimeOff.findMany({
          where: { specialistId, date: { gte: dayStartCheck, lte: dayEndCheck } },
          select: { date: true, allDay: true, startTime: true, endTime: true },
        }),
        tx.appointment.findMany({
          where: {
            specialistId,
            deletedAt: null,
            status: { notIn: ["CANCELED", "NO_SHOW"] },
            startsAt: { lte: dayEndCheck },
            endsAt: { gte: dayStartCheck },
          },
          select: { startsAt: true, endsAt: true },
        }),
      ]);

      const busyRanges = busyRangesForWarsawDay(appointments, dateParam.year, dateParam.month, dateParam.day);
      const freeSlots = computeFreeSlots({
        ...dateParam,
        durationMin: service.durationMin,
        workDays: specialist.workDays,
        customWorkDays,
        timeOffs,
        busyRanges,
        now,
      });

      if (!freeSlots.includes(time)) {
        throw new Error("Ten termin został już zajęty. Wybierz inny.");
      }

      const startsAt = slotToUtc(dateParam.year, dateParam.month, dateParam.day, time);
      const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);

      const normalizedPhone = normalizePhone(phone);
      const patientName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
      const normalizedEmail = email?.trim() || null;

      const existingPatient = await tx.patient.findFirst({
        where: { phone: normalizedPhone, locationId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, email: true },
      });

      let patientId: string;
      if (existingPatient) {
        patientId = existingPatient.id;
        if (normalizedEmail && !existingPatient.email) {
          await tx.patient.update({ where: { id: existingPatient.id }, data: { email: normalizedEmail } });
        }
      } else {
        const createdPatient = await tx.patient.create({
          data: { name: patientName, phone: normalizedPhone, email: normalizedEmail, locationId },
          select: { id: true },
        });
        patientId = createdPatient.id;
      }

      const created = await tx.appointment.create({
        data: {
          patientId,
          specialistId,
          locationId,
          serviceId,
          startsAt,
          endsAt,
          priceEstimate: service.price,
          priceFinal: service.price,
          note: ["Rezerwacja online (strona WWW)", note?.trim()].filter(Boolean).join(" — "),
        },
      });

      return created;
    });

    return NextResponse.json({ ok: true, appointmentId: appointment.id, startsAt: appointment.startsAt });
  } catch (e: any) {
    return bad(typeof e?.message === "string" ? e.message : "Nie udało się zapisać wizyty", 409);
  }
}
